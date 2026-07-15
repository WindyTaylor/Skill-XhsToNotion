#!/usr/bin/env python3
"""Reusable cover image cache and Notion upload helpers."""

from __future__ import annotations

import hashlib
import json
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import requests

try:
    import urllib3
except ImportError:  # pragma: no cover - requests normally provides urllib3.
    urllib3 = None


PROGRAM_DIR = Path(__file__).parent
DEFAULT_DATA_DIR = PROGRAM_DIR / "data"
DEFAULT_COVER_DIR = DEFAULT_DATA_DIR / "covers"
DEFAULT_INDEX_FILE = DEFAULT_DATA_DIR / "cover_assets.json"
DEFAULT_NOTION_FILE_UPLOAD_VERSION = "2026-03-11"
DEFAULT_TIMEOUT = 30
MAX_COVER_BYTES = 20 * 1024 * 1024

IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

DOWNLOAD_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
    ),
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Referer": "https://www.xiaohongshu.com/",
}


class CoverAssetError(Exception):
    """Raised when cover caching or uploading fails."""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def clean_page_id(page_id: str) -> str:
    return str(page_id or "").strip()


def extension_for(content_type: str, source_url: str = "") -> str:
    content_type = (content_type or "").split(";", 1)[0].strip().lower()
    if content_type in IMAGE_EXTENSIONS:
        return IMAGE_EXTENSIONS[content_type]

    parsed_suffix = Path(urlparse(source_url).path).suffix.lower()
    if parsed_suffix in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        return ".jpg" if parsed_suffix == ".jpeg" else parsed_suffix

    guessed = mimetypes.guess_extension(content_type) if content_type else None
    if guessed:
        return ".jpg" if guessed == ".jpe" else guessed
    return ".img"


def read_config_file(path: Optional[Path] = None) -> Dict[str, Any]:
    config_path = path or PROGRAM_DIR / "config.json"
    if not config_path.exists():
        return {}
    with open(config_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def cover_cache_dir_from_config(config: Optional[Dict[str, Any]] = None) -> Path:
    config = config or read_config_file()
    configured = os.getenv("COVER_CACHE_DIR") or config.get("COVER_CACHE_DIR")
    if configured:
        return Path(configured).expanduser()
    return DEFAULT_COVER_DIR


def notion_file_upload_version_from_config(config: Optional[Dict[str, Any]] = None) -> str:
    config = config or read_config_file()
    return (
        os.getenv("NOTION_FILE_UPLOAD_VERSION")
        or config.get("NOTION_FILE_UPLOAD_VERSION")
        or DEFAULT_NOTION_FILE_UPLOAD_VERSION
    )


class CoverAssetStore:
    """Local file cache with a JSON index for cross-process reuse."""

    def __init__(
        self,
        cover_dir: Optional[Path] = None,
        index_file: Optional[Path] = None,
        public_prefix: str = "/covers",
    ):
        self.cover_dir = Path(cover_dir or cover_cache_dir_from_config()).expanduser()
        self.index_file = Path(index_file or self.cover_dir.parent / DEFAULT_INDEX_FILE.name).expanduser()
        self.public_prefix = "/" + public_prefix.strip("/")
        self.cover_dir.mkdir(parents=True, exist_ok=True)
        self.index_file.parent.mkdir(parents=True, exist_ok=True)

    def load_index(self) -> Dict[str, Any]:
        if not self.index_file.exists():
            return {"version": 1, "assets": {}, "page_assets": {}, "source_assets": {}}
        with open(self.index_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            data = {}
        data.setdefault("version", 1)
        data.setdefault("assets", {})
        data.setdefault("page_assets", {})
        data.setdefault("source_assets", {})
        return data

    def save_index(self, index: Dict[str, Any]) -> None:
        tmp_path = self.index_file.with_suffix(self.index_file.suffix + ".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(index, f, ensure_ascii=False, indent=2)
        tmp_path.replace(self.index_file)

    def local_url(self, asset: Dict[str, Any]) -> str:
        filename = asset.get("filename") or ""
        return f"{self.public_prefix}/{filename}" if filename else ""

    def file_path_for_asset(self, asset: Dict[str, Any]) -> Path:
        filename = asset.get("filename") or ""
        if not filename:
            raise CoverAssetError("Cover asset has no local filename.")
        path = (self.cover_dir / filename).resolve()
        path.relative_to(self.cover_dir.resolve())
        return path

    def get_asset(self, asset_id: str) -> Optional[Dict[str, Any]]:
        return self.load_index().get("assets", {}).get(asset_id)

    def get_asset_for_page(self, page_id: str) -> Optional[Dict[str, Any]]:
        clean_id = clean_page_id(page_id)
        if not clean_id:
            return None
        index = self.load_index()
        asset_id = index.get("page_assets", {}).get(clean_id)
        if not asset_id:
            return None
        return index.get("assets", {}).get(asset_id)

    def get_local_url_for_page(self, page_id: str) -> str:
        asset = self.get_asset_for_page(page_id)
        if not asset:
            return ""
        try:
            if not self.file_path_for_asset(asset).exists():
                return ""
        except (CoverAssetError, ValueError):
            return ""
        return self.local_url(asset)

    def cache_from_url(
        self,
        source_url: str,
        page_id: str = "",
        force: bool = False,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> Dict[str, Any]:
        source_url = str(source_url or "").strip()
        if not source_url:
            raise CoverAssetError("Missing cover source URL.")

        index = self.load_index()
        cached_asset_id = index.get("source_assets", {}).get(source_url)
        if cached_asset_id and not force:
            cached = index.get("assets", {}).get(cached_asset_id)
            if cached:
                path = self.file_path_for_asset(cached)
                if path.exists():
                    self._remember_relationships(index, cached, source_url, page_id)
                    self.save_index(index)
                    cached["local_url"] = self.local_url(cached)
                    return cached

        content, content_type = self._download(source_url, timeout=timeout)
        digest = hashlib.sha256(content).hexdigest()
        ext = extension_for(content_type, source_url)
        filename = f"{digest}{ext}"
        file_path = self.cover_dir / filename
        if force or not file_path.exists():
            file_path.write_bytes(content)

        asset = index["assets"].get(digest, {})
        asset.update(
            {
                "id": digest,
                "filename": filename,
                "relative_path": f"covers/{filename}",
                "content_type": content_type,
                "size": len(content),
                "sha256": digest,
                "updated_at": utc_now_iso(),
            }
        )
        asset.setdefault("created_at", utc_now_iso())
        asset.setdefault("source_urls", [])
        asset.setdefault("page_ids", [])

        index["assets"][digest] = asset
        self._remember_relationships(index, asset, source_url, page_id)
        self.save_index(index)
        asset["local_url"] = self.local_url(asset)
        return asset

    def mark_uploaded(
        self,
        asset_id: str,
        file_upload_id: str,
        page_id: str = "",
        upload_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        index = self.load_index()
        asset = index.get("assets", {}).get(asset_id)
        if not asset:
            raise CoverAssetError(f"Unknown cover asset: {asset_id}")
        asset["notion_file_upload_id"] = file_upload_id
        asset["notion_uploaded_at"] = utc_now_iso()
        if upload_payload:
            asset["notion_file_upload"] = {
                key: upload_payload.get(key)
                for key in ("id", "status", "filename", "content_type", "content_length")
                if key in upload_payload
            }
        if page_id:
            self._remember_relationships(index, asset, "", page_id)
        self.save_index(index)
        asset["local_url"] = self.local_url(asset)
        return asset

    def _remember_relationships(
        self,
        index: Dict[str, Any],
        asset: Dict[str, Any],
        source_url: str = "",
        page_id: str = "",
    ) -> None:
        asset_id = asset["id"]
        if source_url:
            index.setdefault("source_assets", {})[source_url] = asset_id
            urls = asset.setdefault("source_urls", [])
            if source_url not in urls:
                urls.append(source_url)
        clean_id = clean_page_id(page_id)
        if clean_id:
            index.setdefault("page_assets", {})[clean_id] = asset_id
            page_ids = asset.setdefault("page_ids", [])
            if clean_id not in page_ids:
                page_ids.append(clean_id)

    def _download(self, source_url: str, timeout: int) -> tuple[bytes, str]:
        try:
            response = requests.get(
                source_url,
                headers=DOWNLOAD_HEADERS,
                stream=True,
                timeout=timeout,
            )
        except requests.RequestException as exc:
            raise CoverAssetError(f"Cover download failed: {exc}") from exc

        if response.status_code >= 400:
            response.close()
            raise CoverAssetError(f"Cover download failed: HTTP {response.status_code}")

        content_type = (response.headers.get("Content-Type") or "").split(";", 1)[0].strip()
        if content_type and not content_type.lower().startswith("image/"):
            response.close()
            raise CoverAssetError(f"Cover URL is not an image: {content_type}")

        chunks = []
        total = 0
        for chunk in response.iter_content(chunk_size=65536):
            if not chunk:
                continue
            total += len(chunk)
            if total > MAX_COVER_BYTES:
                response.close()
                raise CoverAssetError("Cover image is larger than 20 MB.")
            chunks.append(chunk)
        response.close()

        if not chunks:
            raise CoverAssetError("Cover download returned an empty body.")
        return b"".join(chunks), content_type or "application/octet-stream"


class NotionFileUploader:
    """Small-file upload client for Notion-managed files."""

    def __init__(
        self,
        notion_api_key: str,
        notion_version: str = DEFAULT_NOTION_FILE_UPLOAD_VERSION,
        timeout: int = DEFAULT_TIMEOUT,
        verify_ssl: bool = True,
        session: Optional[requests.Session] = None,
    ):
        self.notion_api_key = notion_api_key
        self.notion_version = notion_version or DEFAULT_NOTION_FILE_UPLOAD_VERSION
        self.timeout = timeout
        self.verify_ssl = verify_ssl
        self.session = session or requests.Session()
        if not self.verify_ssl and urllib3:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    @property
    def json_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.notion_api_key}",
            "Notion-Version": self.notion_version,
            "Content-Type": "application/json",
        }

    @property
    def upload_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.notion_api_key}",
            "Notion-Version": self.notion_version,
        }

    def create_file_upload(self, filename: str, content_type: str) -> Dict[str, Any]:
        payload = {
            "mode": "single_part",
            "filename": filename,
            "content_type": content_type or "application/octet-stream",
        }
        return self._request(
            "POST",
            "https://api.notion.com/v1/file_uploads",
            headers=self.json_headers,
            json=payload,
        )

    def send_file_upload(self, file_upload_id: str, path: Path, content_type: str) -> Dict[str, Any]:
        with open(path, "rb") as f:
            files = {"file": (path.name, f, content_type or "application/octet-stream")}
            return self._request(
                "POST",
                f"https://api.notion.com/v1/file_uploads/{file_upload_id}/send",
                headers=self.upload_headers,
                files=files,
            )

    def upload_file(self, path: Path, content_type: str) -> Dict[str, Any]:
        created = self.create_file_upload(path.name, content_type)
        file_upload_id = created.get("id")
        if not file_upload_id:
            raise CoverAssetError("Notion did not return a file upload id.")
        sent = self.send_file_upload(file_upload_id, path, content_type)
        sent.setdefault("id", file_upload_id)
        return sent

    def set_page_cover_file_upload(self, page_id: str, file_upload_id: str) -> Dict[str, Any]:
        payload = {
            "cover": {
                "type": "file_upload",
                "file_upload": {"id": file_upload_id},
            }
        }
        return self._request(
            "PATCH",
            f"https://api.notion.com/v1/pages/{page_id}",
            headers=self.json_headers,
            json=payload,
        )

    def set_page_cover_external(self, page_id: str, cover_url: str) -> Dict[str, Any]:
        payload = {
            "cover": {
                "type": "external",
                "external": {"url": cover_url},
            }
        }
        return self._request(
            "PATCH",
            f"https://api.notion.com/v1/pages/{page_id}",
            headers=self.json_headers,
            json=payload,
        )

    def _request(self, method: str, url: str, **kwargs: Any) -> Dict[str, Any]:
        kwargs.setdefault("timeout", self.timeout)
        kwargs.setdefault("verify", self.verify_ssl)
        try:
            response = self.session.request(method, url, **kwargs)
        except requests.RequestException as exc:
            raise CoverAssetError(f"Notion file upload request failed: {exc}") from exc
        if response.status_code >= 400:
            raise CoverAssetError(
                f"Notion file upload request failed ({response.status_code}): {response.text}"
            )
        if response.content:
            return response.json()
        return {}


class CoverAssetService:
    """High-level workflow for cache -> Notion upload -> page cover attach."""

    def __init__(
        self,
        store: Optional[CoverAssetStore] = None,
        uploader: Optional[NotionFileUploader] = None,
    ):
        self.store = store or CoverAssetStore()
        self.uploader = uploader

    def cache_cover(self, source_url: str, page_id: str = "", force: bool = False) -> Dict[str, Any]:
        asset = self.store.cache_from_url(source_url, page_id=page_id, force=force)
        return self._response(asset)

    def upload_cached_asset(self, asset_id: str, page_id: str = "") -> Dict[str, Any]:
        if not self.uploader:
            raise CoverAssetError("Notion uploader is not configured.")
        asset = self.store.get_asset(asset_id)
        if not asset:
            raise CoverAssetError(f"Unknown cover asset: {asset_id}")

        file_upload_id = asset.get("notion_file_upload_id")
        if not file_upload_id:
            uploaded = self.uploader.upload_file(
                self.store.file_path_for_asset(asset),
                asset.get("content_type") or "application/octet-stream",
            )
            file_upload_id = uploaded.get("id")
            asset = self.store.mark_uploaded(asset_id, file_upload_id, page_id=page_id, upload_payload=uploaded)

        if page_id:
            self.uploader.set_page_cover_file_upload(page_id, file_upload_id)
            asset = self.store.mark_uploaded(asset_id, file_upload_id, page_id=page_id)

        return self._response(asset)

    def cache_upload_and_attach(
        self,
        source_url: str,
        page_id: str,
        force_cache: bool = False,
    ) -> Dict[str, Any]:
        asset_response = self.cache_cover(source_url, page_id=page_id, force=force_cache)
        return self.upload_cached_asset(asset_response["id"], page_id=page_id)

    def _response(self, asset: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": asset.get("id"),
            "filename": asset.get("filename"),
            "relative_path": asset.get("relative_path"),
            "local_url": self.store.local_url(asset),
            "content_type": asset.get("content_type"),
            "size": asset.get("size"),
            "sha256": asset.get("sha256"),
            "source_urls": asset.get("source_urls", []),
            "page_ids": asset.get("page_ids", []),
            "notion_file_upload_id": asset.get("notion_file_upload_id", ""),
            "notion_uploaded_at": asset.get("notion_uploaded_at", ""),
        }
