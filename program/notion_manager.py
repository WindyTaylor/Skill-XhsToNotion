#!/usr/bin/env python3
"""Notion note search and album management helpers."""

import json
import os
import re
import threading
from pathlib import Path
from urllib.parse import urlsplit

import requests

from cover_assets import (
    CoverAssetError,
    CoverAssetService,
    CoverAssetStore,
    NotionFileUploader,
    notion_file_upload_version_from_config,
)

try:
    import urllib3
except ImportError:  # pragma: no cover - urllib3 is a requests dependency in normal installs.
    urllib3 = None


PROGRAM_DIR = Path(__file__).parent
CONFIG_FILE = PROGRAM_DIR / "config.json"
ALBUM_MAP_FILE = PROGRAM_DIR / "album_map.json"
ALBUM_DESCRIPTIONS_FILE = PROGRAM_DIR / "album_descriptions.json"
ALBUM_DOMAINS_FILE = PROGRAM_DIR / "album_domains.json"

TITLE_PROP = "标题"
URL_PROP = "小红书链接"
SUMMARY_PROP = "简介"
AUTHOR_PROP = "作者"
STATUS_PROP = "状态"
TAGS_PROP = "野生标签"
COLOR_TAGS_PROP = "彩色标签"
ALBUM_PROP = "库B：专辑标签库"
COVER_URL_PROP = "封面"

VALID_STATUSES = (
    "待阅读",
    "待路由",
    "已整理",
    "已沉淀",
    "已实践",
    "长期参考",
    "已废弃",
)
MAX_BATCH_SIZE = 100
MAX_AI_BATCH_SIZE = 20
INVALID_TAGS = {
    "-",
    "--",
    "n/a",
    "na",
    "none",
    "null",
    "undefined",
    "无",
    "未知",
    "无标签",
}

DEFAULT_NOTION_VERSION = "2025-09-03"
DEFAULT_NOTION_FILE_UPLOAD_VERSION = "2026-03-11"
DEFAULT_NOTION_TIMEOUT = 15
DEFAULT_LIMIT = 100
MAX_LIMIT = 200
DEFAULT_MAX_SCAN = 500
MAX_ALBUM_DESCRIPTION_LENGTH = 2000
MAX_ALBUM_NAME_LENGTH = 100
ALBUM_DESCRIPTIONS_LOCK = threading.Lock()
ALBUM_METADATA_LOCK = threading.Lock()
VALID_ALBUM_DOMAINS = (
    "🛠️ 硬核技术与职业效能",
    "📸 视觉叙事与影像实验室",
    "🦾 生活百科与生存技能",
    "🌿 身心重塑与自我管理",
    "📍 地理图志与探店计划",
    "🎭 奇趣碎片与小众文化",
)


class NotionManagerError(Exception):
    """Base error for the management console backend."""


class NotionConfigError(NotionManagerError):
    """Raised when Notion configuration is missing or invalid."""


class NotionAPIError(NotionManagerError):
    """Raised when the Notion API returns an error response."""


def _as_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _compact_text(value):
    return " ".join(str(value or "").split())


def _normalize(value):
    return _compact_text(value).lower()


def split_filter_terms(value):
    terms = []
    seen = set()
    for part in re.split(r"[+＋]", str(value or "")):
        term = _normalize(part)
        if term and term not in seen:
            terms.append(term)
            seen.add(term)
    return terms


def _load_json_file(path):
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def load_config():
    """Load Notion config with environment variables taking precedence."""
    file_config = _load_json_file(CONFIG_FILE)

    notion_api_key = os.getenv("NOTION_API_KEY") or file_config.get("NOTION_API_KEY")
    notion_database_id = os.getenv("NOTION_DATABASE_ID") or file_config.get("NOTION_DATABASE_ID")
    notion_data_source_id = (
        os.getenv("NOTION_DATA_SOURCE_ID")
        or file_config.get("NOTION_DATA_SOURCE_ID")
        or ""
    )
    notion_version = (
        os.getenv("NOTION_VERSION")
        or file_config.get("NOTION_VERSION")
        or DEFAULT_NOTION_VERSION
    )
    notion_file_upload_version = (
        os.getenv("NOTION_FILE_UPLOAD_VERSION")
        or file_config.get("NOTION_FILE_UPLOAD_VERSION")
        or DEFAULT_NOTION_FILE_UPLOAD_VERSION
    )
    notion_timeout = int(
        os.getenv("NOTION_TIMEOUT")
        or file_config.get("NOTION_TIMEOUT")
        or DEFAULT_NOTION_TIMEOUT
    )
    verify_ssl = _as_bool(
        os.getenv("NOTION_VERIFY_SSL", file_config.get("NOTION_VERIFY_SSL")),
        default=False,
    )

    if not notion_api_key:
        raise NotionConfigError("缺少 NOTION_API_KEY，请先配置 Notion integration token。")
    if not notion_database_id:
        raise NotionConfigError("缺少 NOTION_DATABASE_ID，请先配置 Notion 内容总库 ID。")

    return {
        "notion_api_key": notion_api_key,
        "notion_database_id": notion_database_id,
        "notion_data_source_id": notion_data_source_id,
        "notion_version": notion_version,
        "notion_file_upload_version": notion_file_upload_version,
        "notion_timeout": notion_timeout,
        "verify_ssl": verify_ssl,
        "raw_config": file_config,
    }


def load_album_map():
    data = _load_json_file(ALBUM_MAP_FILE)
    albums = {}
    for name, album_id in data.items():
        clean_name = str(name).strip()
        clean_id = str(album_id).strip()
        if clean_name and clean_id and clean_id != "id_fallback":
            albums[clean_name] = clean_id
    return albums


def load_album_descriptions(path=ALBUM_DESCRIPTIONS_FILE):
    try:
        data = _load_json_file(path)
    except (OSError, json.JSONDecodeError) as exc:
        raise NotionManagerError(f"读取专辑描述失败: {exc}") from exc
    return {
        str(name).strip(): str(description).strip()
        for name, description in data.items()
        if str(name).strip() and str(description).strip()
    }


def load_album_domains(path=ALBUM_DOMAINS_FILE):
    try:
        data = _load_json_file(path)
    except (OSError, json.JSONDecodeError) as exc:
        raise NotionManagerError(f"读取专辑主领域失败: {exc}") from exc
    return {
        str(name).strip(): str(domain).strip()
        for name, domain in data.items()
        if str(name).strip() and str(domain).strip()
    }


def save_album_descriptions(descriptions, path=ALBUM_DESCRIPTIONS_FILE):
    clean_descriptions = {
        str(name).strip(): str(description).strip()
        for name, description in descriptions.items()
        if str(name).strip() and str(description).strip()
    }
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(clean_descriptions, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(temp_path, path)
    except OSError as exc:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise NotionManagerError(f"保存专辑描述失败: {exc}") from exc


def save_album_map(album_map, path=ALBUM_MAP_FILE):
    clean_map = {
        str(name).strip(): str(album_id).strip()
        for name, album_id in album_map.items()
        if str(name).strip() and str(album_id).strip()
    }
    _save_json_mapping(clean_map, path, "保存专辑映射失败")


def save_album_domains(domains, path=ALBUM_DOMAINS_FILE):
    clean_domains = {
        str(name).strip(): str(domain).strip()
        for name, domain in domains.items()
        if str(name).strip() and str(domain).strip()
    }
    _save_json_mapping(clean_domains, path, "保存专辑主领域失败")


def _save_json_mapping(mapping, path, error_label):
    temp_path = path.with_suffix(f"{path.suffix}.tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(mapping, f, ensure_ascii=False, indent=2)
            f.write("\n")
        os.replace(temp_path, path)
    except OSError as exc:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass
        raise NotionManagerError(f"{error_label}: {exc}") from exc


def read_title(prop):
    return _compact_text("".join(item.get("plain_text", "") for item in prop.get("title", [])))


def read_rich_text(prop):
    return _compact_text("".join(item.get("plain_text", "") for item in prop.get("rich_text", [])))


def read_url(prop):
    return prop.get("url") or ""


def read_cover_url(page):
    """Extract the cover image URL from a Notion page payload.

    Notion returns page.cover as either an external URL or an uploaded file
    with a temporary Notion-hosted URL. The frontend uses this as the card
    preview image in the gallery view.
    """
    cover = page.get("cover") or {}
    cover_type = cover.get("type")
    if cover_type == "external":
        return (cover.get("external") or {}).get("url") or ""
    if cover_type == "file":
        return (cover.get("file") or {}).get("url") or ""
    return ""


def read_status(prop):
    status = prop.get("select") or {}
    return status.get("name") or ""


def read_multi_select(prop):
    return [
        item.get("name", "").strip()
        for item in prop.get("multi_select", [])
        if item.get("name", "").strip()
    ]


def rich_text_payload(value):
    text = str(value or "").strip()
    if not text:
        return {"rich_text": []}
    chunks = [text[index:index + 2000] for index in range(0, len(text), 2000)]
    return {
        "rich_text": [
            {"type": "text", "text": {"content": chunk}}
            for chunk in chunks
        ]
    }


def title_payload(value):
    text = str(value or "").strip()[:2000]
    return {
        "title": (
            [{"type": "text", "text": {"content": text}}]
            if text
            else []
        )
    }


def normalize_tags(values):
    if isinstance(values, str):
        raw_items = re.split(r"[,，、;；\n]+", values)
    else:
        raw_items = list(values or [])

    clean_items = []
    seen = set()
    for item in raw_items:
        clean = re.sub(r"\s+", " ", str(item or "")).strip(" #＃,，、;；")
        if not clean or clean.casefold() in INVALID_TAGS:
            continue
        clean = clean[:80]
        key = clean.casefold()
        if key in seen:
            continue
        seen.add(key)
        clean_items.append(clean)
    return clean_items[:100]


def canonical_duplicate_key(note):
    source_url = str(note.get("url") or "").strip()
    if source_url:
        try:
            parsed = urlsplit(source_url)
            match = re.search(
                r"/(?:explore|discovery/item|board/[^/]+)/([a-zA-Z0-9]+)",
                parsed.path,
            )
            if match:
                return f"xhs:{match.group(1).lower()}"
            host = parsed.netloc.lower().removeprefix("www.")
            path = parsed.path.rstrip("/").lower()
            if host and path:
                return f"url:{host}{path}"
        except ValueError:
            pass

    title = _normalize(note.get("title"))
    author = _normalize(note.get("author"))
    if title:
        return f"text:{title}|{author}"
    return ""


class NotionNoteManager:
    def __init__(self):
        config = load_config()
        self.notion_api_key = config["notion_api_key"]
        self.database_id = config["notion_database_id"]
        self.data_source_id = config["notion_data_source_id"]
        self.notion_version = config["notion_version"]
        self.notion_file_upload_version = config["notion_file_upload_version"]
        self.notion_timeout = config["notion_timeout"]
        self.verify_ssl = config["verify_ssl"]
        self.session = requests.Session()
        self.album_map = load_album_map()
        self.album_id_to_name = {album_id: name for name, album_id in self.album_map.items()}
        self.cover_store = CoverAssetStore()
        self.cover_service = CoverAssetService(
            store=self.cover_store,
            uploader=NotionFileUploader(
                self.notion_api_key,
                notion_version=notion_file_upload_version_from_config(config["raw_config"]),
                timeout=self.notion_timeout,
                verify_ssl=self.verify_ssl,
                session=self.session,
            ),
        )

        if not self.verify_ssl and urllib3:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    @property
    def headers(self):
        return {
            "Authorization": f"Bearer {self.notion_api_key}",
            "Notion-Version": self.notion_version,
            "Content-Type": "application/json",
        }

    def request(self, method, url, **kwargs):
        kwargs.setdefault("headers", self.headers)
        kwargs.setdefault("timeout", self.notion_timeout)
        kwargs.setdefault("verify", self.verify_ssl)
        try:
            response = self.session.request(method, url, **kwargs)
        except requests.RequestException as exc:
            raise NotionAPIError(f"Notion API 网络请求失败: {exc}") from exc
        if response.status_code >= 400:
            message = response.text
            try:
                payload = response.json()
                message = payload.get("message") or message
            except ValueError:
                pass
            raise NotionAPIError(f"Notion API 请求失败 ({response.status_code}): {message}")
        if response.content:
            return response.json()
        return {}

    def list_albums(self):
        domain_file = getattr(self, "album_domains_file", ALBUM_DOMAINS_FILE)
        album_domains = load_album_domains(domain_file)
        return [
            {
                "name": name,
                "id": album_id,
                "domain": album_domains.get(name, ""),
            }
            for name, album_id in sorted(self.album_map.items(), key=lambda item: item[0])
        ]

    def get_album_source_context(self):
        cached_context = getattr(self, "album_source_context", None)
        if cached_context:
            return cached_context

        content_source_id = self.data_source_id
        if not content_source_id:
            database = self.request(
                "GET",
                f"https://api.notion.com/v1/databases/{self.database_id}",
            )
            data_sources = database.get("data_sources") or []
            content_source_id = data_sources[0].get("id") if data_sources else ""
            self.data_source_id = content_source_id or ""
        if not content_source_id:
            raise NotionManagerError("无法定位 Notion 内容总库的数据源。")

        content_source = self.request(
            "GET",
            f"https://api.notion.com/v1/data_sources/{content_source_id}",
        )
        album_relation = (
            (content_source.get("properties") or {})
            .get(ALBUM_PROP, {})
            .get("relation")
            or {}
        )
        album_source_id = album_relation.get("data_source_id")
        if not album_source_id:
            raise NotionManagerError("无法定位 Notion 专辑库的数据源。")

        album_source = self.request(
            "GET",
            f"https://api.notion.com/v1/data_sources/{album_source_id}",
        )
        properties = album_source.get("properties") or {}
        title_property = next(
            (
                name
                for name, prop in properties.items()
                if prop.get("type") == "title"
            ),
            "",
        )
        if not title_property:
            raise NotionManagerError("Notion 专辑库缺少标题属性。")

        domain_property = (
            "主领域"
            if (properties.get("主领域") or {}).get("type") == "select"
            else ""
        )
        context = {
            "data_source_id": album_source_id,
            "title_property": title_property,
            "domain_property": domain_property,
        }
        self.album_source_context = context
        return context

    def validate_new_album_name(self, album_name, *, exclude_album_id=""):
        clean_name = _compact_text(album_name)
        if not clean_name:
            raise NotionManagerError("请输入专辑名称。")
        if len(clean_name) > MAX_ALBUM_NAME_LENGTH:
            raise NotionManagerError(
                f"专辑名称不能超过 {MAX_ALBUM_NAME_LENGTH} 个字符。"
            )
        lowered = clean_name.casefold()
        duplicate = next(
            (
                name
                for name, album_id in self.album_map.items()
                if album_id != exclude_album_id and name.casefold() == lowered
            ),
            "",
        )
        if duplicate:
            raise NotionManagerError(f"专辑名称已存在: {duplicate}")
        return clean_name

    def create_album(self, album_name, domain):
        clean_name = self.validate_new_album_name(album_name)
        clean_domain = _compact_text(domain)
        if clean_domain not in VALID_ALBUM_DOMAINS:
            raise NotionManagerError("请选择有效的专辑主领域。")

        context = self.get_album_source_context()
        properties = {
            context["title_property"]: {
                "title": [{"type": "text", "text": {"content": clean_name}}]
            }
        }
        if context["domain_property"]:
            properties[context["domain_property"]] = {
                "select": {"name": clean_domain}
            }

        page = self.request(
            "POST",
            "https://api.notion.com/v1/pages",
            json={
                "parent": {
                    "type": "data_source_id",
                    "data_source_id": context["data_source_id"],
                },
                "properties": properties,
            },
        )
        album_id = page.get("id")
        if not album_id:
            raise NotionManagerError("Notion 已响应，但未返回新专辑页面 ID。")

        album_map_file = getattr(self, "album_map_file", ALBUM_MAP_FILE)
        domain_file = getattr(self, "album_domains_file", ALBUM_DOMAINS_FILE)
        with ALBUM_METADATA_LOCK:
            album_domains = load_album_domains(domain_file)
            self.album_map[clean_name] = album_id
            self.album_id_to_name[album_id] = clean_name
            album_domains[clean_name] = clean_domain
            save_album_map(self.album_map, album_map_file)
            save_album_domains(album_domains, domain_file)

        return {
            "ok": True,
            "album": {
                "name": clean_name,
                "id": album_id,
                "domain": clean_domain,
            },
            "message": f"已创建专辑「{clean_name}」。",
        }

    def rename_album(self, album_name, new_name):
        old_name, album_id = self.resolve_album(album_name)
        clean_name = self.validate_new_album_name(
            new_name,
            exclude_album_id=album_id,
        )
        if clean_name == old_name:
            raise NotionManagerError("新名称与当前专辑名称相同。")

        context = self.get_album_source_context()
        self.request(
            "PATCH",
            f"https://api.notion.com/v1/pages/{album_id}",
            json={
                "properties": {
                    context["title_property"]: {
                        "title": [
                            {"type": "text", "text": {"content": clean_name}}
                        ]
                    }
                }
            },
        )

        album_map_file = getattr(self, "album_map_file", ALBUM_MAP_FILE)
        domain_file = getattr(self, "album_domains_file", ALBUM_DOMAINS_FILE)
        description_file = getattr(
            self,
            "album_descriptions_file",
            ALBUM_DESCRIPTIONS_FILE,
        )
        with ALBUM_METADATA_LOCK, ALBUM_DESCRIPTIONS_LOCK:
            album_domains = load_album_domains(domain_file)
            descriptions = load_album_descriptions(description_file)
            domain = album_domains.pop(old_name, "")
            description = descriptions.pop(old_name, "")
            self.album_map.pop(old_name, None)
            self.album_map[clean_name] = album_id
            self.album_id_to_name[album_id] = clean_name
            if domain:
                album_domains[clean_name] = domain
            if description:
                descriptions[clean_name] = description
            save_album_map(self.album_map, album_map_file)
            save_album_domains(album_domains, domain_file)
            save_album_descriptions(descriptions, description_file)

        return {
            "ok": True,
            "album": {
                "name": clean_name,
                "id": album_id,
                "domain": domain,
            },
            "old_name": old_name,
            "message": f"已将专辑「{old_name}」重命名为「{clean_name}」。",
        }

    def list_album_descriptions(self):
        description_file = getattr(
            self,
            "album_descriptions_file",
            ALBUM_DESCRIPTIONS_FILE,
        )
        domain_file = getattr(self, "album_domains_file", ALBUM_DOMAINS_FILE)
        with ALBUM_DESCRIPTIONS_LOCK:
            descriptions = load_album_descriptions(description_file)
        album_domains = load_album_domains(domain_file)
        albums = [
            {
                "name": name,
                "id": album_id,
                "domain": album_domains.get(name, ""),
                "description": descriptions.get(name, ""),
            }
            for name, album_id in sorted(self.album_map.items(), key=lambda item: item[0])
        ]
        return {
            "albums": albums,
            "described": sum(bool(item["description"]) for item in albums),
            "total": len(albums),
        }

    def update_album_description(self, album_name, description):
        clean_name = _compact_text(album_name)
        if clean_name not in self.album_map:
            raise NotionManagerError(f"找不到专辑: {clean_name or '未指定'}")

        clean_description = str(description or "").strip()
        if len(clean_description) > MAX_ALBUM_DESCRIPTION_LENGTH:
            raise NotionManagerError(
                f"专辑描述不能超过 {MAX_ALBUM_DESCRIPTION_LENGTH} 个字符。"
            )

        description_file = getattr(
            self,
            "album_descriptions_file",
            ALBUM_DESCRIPTIONS_FILE,
        )
        with ALBUM_DESCRIPTIONS_LOCK:
            descriptions = load_album_descriptions(description_file)
            if clean_description:
                descriptions[clean_name] = clean_description
            else:
                descriptions.pop(clean_name, None)
            save_album_descriptions(descriptions, description_file)

        action = "保存" if clean_description else "清空"
        domain_file = getattr(self, "album_domains_file", ALBUM_DOMAINS_FILE)
        album_domains = load_album_domains(domain_file)
        return {
            "ok": True,
            "album": {
                "name": clean_name,
                "id": self.album_map[clean_name],
                "domain": album_domains.get(clean_name, ""),
                "description": clean_description,
            },
            "message": f"已{action}「{clean_name}」的 AI 专辑说明。",
        }

    def fetch_cover_for_page(self, page_id):
        """Fetch a single page and return its cover URL.

        Notion's database query endpoint does not always include the `cover`
        field in the response payload, even when the page has a cover set in
        the UI. The single-page GET endpoint reliably returns the full cover
        object, so we use it as a fallback to enrich the gallery cards.
        """
        try:
            page = self.get_page(page_id)
        except NotionAPIError:
            return ""
        return read_cover_url(page)

    def cache_cover_asset(self, source_url, page_id="", upload_to_notion=False):
        """Cache a cover locally, optionally upload it and set it as page cover."""
        try:
            if upload_to_notion:
                if not page_id:
                    raise NotionManagerError("上传到 Notion 时需要 page_id。")
                result = self.cover_service.cache_upload_and_attach(source_url, page_id)
            else:
                result = self.cover_service.cache_cover(source_url, page_id=page_id)
            return {"ok": True, "asset": result}
        except CoverAssetError as exc:
            raise NotionManagerError(str(exc)) from exc

    def debug_first_page_cover(self, limit=3):
        """Diagnostic helper: dump the raw cover field for the first N pages.

        Notion's database query response may or may not include the full cover
        object — in some API versions cover is only present on the detail
        endpoint. This helper fetches the first few rows and returns the raw
        cover payload so the frontend / user can confirm what Notion returned.
        """
        data = self.request(
            "POST",
            self.get_query_url(),
            json={"page_size": limit},
        )
        results = []
        for page in data.get("results", []):
            results.append({
                "id": page.get("id"),
                "title": read_title(page.get("properties", {}).get(TITLE_PROP, {})),
                "cover_raw": page.get("cover"),
                "cover_extracted": read_cover_url(page),
            })
        return results

    def get_query_url(self):
        """Return the correct query endpoint for the configured Notion database.

        Newer Notion API versions expose database rows through data sources
        instead of the legacy /databases/{id}/query endpoint.
        """
        if self.data_source_id:
            return f"https://api.notion.com/v1/data_sources/{self.data_source_id}/query"

        database = self.request(
            "GET",
            f"https://api.notion.com/v1/databases/{self.database_id}",
        )
        data_sources = database.get("data_sources") or []
        if data_sources:
            self.data_source_id = data_sources[0].get("id") or ""
            if self.data_source_id:
                return f"https://api.notion.com/v1/data_sources/{self.data_source_id}/query"

        return f"https://api.notion.com/v1/databases/{self.database_id}/query"

    def resolve_album(self, album_name):
        target = (album_name or "").strip()
        if not target:
            raise NotionManagerError("请选择目标专辑。")
        if target in self.album_map:
            return target, self.album_map[target]
        if target in self.album_id_to_name:
            return self.album_id_to_name[target], target

        lowered = target.lower()
        exact = [name for name in self.album_map if name.lower() == lowered]
        if len(exact) == 1:
            name = exact[0]
            return name, self.album_map[name]

        contains = [name for name in self.album_map if lowered in name.lower()]
        if len(contains) == 1:
            name = contains[0]
            return name, self.album_map[name]

        raise NotionManagerError(f"找不到唯一匹配的专辑: {target}")

    def build_notion_filter(self, filters):
        clauses = []
        status = (filters.get("status") or "").strip()
        album_name = (filters.get("album") or "").strip()

        if status:
            clauses.append({"property": STATUS_PROP, "select": {"equals": status}})

        if album_name:
            _, album_id = self.resolve_album(album_name)
            clauses.append({"property": ALBUM_PROP, "relation": {"contains": album_id}})

        if not clauses:
            return None
        if len(clauses) == 1:
            return clauses[0]
        return {"and": clauses}

    def query_notes(self, filters):
        limit = min(max(int(filters.get("limit") or DEFAULT_LIMIT), 1), MAX_LIMIT)
        max_scan = min(max(int(filters.get("max_scan") or DEFAULT_MAX_SCAN), limit), 1000)
        cursor = (filters.get("cursor") or "").strip() or None
        notion_filter = self.build_notion_filter(filters)

        notes = []
        scanned = 0
        has_more = False
        next_cursor = None
        needs_local_text_filter = any(
            (filters.get(name) or "").strip()
            for name in ("q", "title", "author", "tag")
        )

        while len(notes) < limit and scanned < max_scan:
            remaining_scan = max_scan - scanned
            remaining_notes = limit - len(notes)
            if needs_local_text_filter:
                page_size = min(100, remaining_scan)
            else:
                page_size = min(100, remaining_scan, remaining_notes)
            payload = {"page_size": page_size}
            if cursor:
                payload["start_cursor"] = cursor
            if notion_filter:
                payload["filter"] = notion_filter

            data = self.request(
                "POST",
                self.get_query_url(),
                json=payload,
            )
            results = data.get("results", [])
            scanned += len(results)

            for page in results:
                note = self.page_to_note(page)
                if not note.get("cover"):
                    note["cover"] = self.fetch_cover_for_page(note["id"])
                if self.matches_filters(note, filters):
                    notes.append(note)
                    if len(notes) >= limit:
                        break

            has_more = bool(data.get("has_more"))
            next_cursor = data.get("next_cursor")
            cursor = next_cursor
            if not has_more:
                break

        return {
            "notes": notes,
            "has_more": has_more,
            "next_cursor": next_cursor,
            "scanned": scanned,
            "limit": limit,
        }

    def page_to_note(self, page):
        props = page.get("properties", {})
        relations = props.get(ALBUM_PROP, {}).get("relation", [])
        album_ids = [item.get("id") for item in relations if item.get("id")]
        albums = [self.album_id_to_name.get(album_id, album_id) for album_id in album_ids]
        page_id = page.get("id")
        notion_cover = read_cover_url(page)
        local_cover = self.cover_store.get_local_url_for_page(page_id)

        return {
            "id": page_id,
            "title": read_title(props.get(TITLE_PROP, {})),
            "url": read_url(props.get(URL_PROP, {})),
            "cover": local_cover or notion_cover,
            "cover_local": local_cover,
            "cover_notion": notion_cover,
            "summary": read_rich_text(props.get(SUMMARY_PROP, {})),
            "author": read_rich_text(props.get(AUTHOR_PROP, {})),
            "tags": read_rich_text(props.get(TAGS_PROP, {})),
            "color_tags": read_multi_select(props.get(COLOR_TAGS_PROP, {})),
            "status": read_status(props.get(STATUS_PROP, {})),
            "albums": albums,
            "album_ids": album_ids,
            "cover_source": read_url(props.get(COVER_URL_PROP, {})),
            "notion_url": page.get("url", ""),
            "created_time": page.get("created_time", ""),
            "last_edited_time": page.get("last_edited_time", ""),
        }

    def matches_filters(self, note, filters):
        q_terms = split_filter_terms(filters.get("q"))
        title_terms = split_filter_terms(filters.get("title"))
        author_terms = split_filter_terms(filters.get("author"))
        tag_terms = split_filter_terms(filters.get("tag"))
        album = _normalize(filters.get("album"))
        status = _normalize(filters.get("status"))

        title_text = _normalize(note.get("title"))
        summary_text = _normalize(note.get("summary"))
        author_text = _normalize(note.get("author"))
        tag_text = _normalize(note.get("tags"))
        status_text = _normalize(note.get("status"))
        album_text = _normalize(" ".join(note.get("albums") or []))
        album_id_text = _normalize(" ".join(note.get("album_ids") or []))

        searchable_text = " ".join(
            [title_text, summary_text, author_text, tag_text]
        )
        if q_terms and not all(term in searchable_text for term in q_terms):
            return False
        if title_terms and not all(term in title_text for term in title_terms):
            return False
        if author_terms and not all(term in author_text for term in author_terms):
            return False
        if tag_terms and not all(term in tag_text for term in tag_terms):
            return False
        if album and album not in album_text and album not in album_id_text:
            return False
        if status and status != status_text:
            return False
        return True

    def get_page(self, page_id):
        return self.request("GET", f"https://api.notion.com/v1/pages/{page_id}")

    def patch_page_properties(self, page_id, properties):
        return self.request(
            "PATCH",
            f"https://api.notion.com/v1/pages/{page_id}",
            json={"properties": properties},
        )

    def patch_page(self, page_id, properties=None, cover=None):
        payload = {}
        if properties:
            payload["properties"] = properties
        if cover:
            payload["cover"] = cover
        if not payload:
            return {}
        return self.request(
            "PATCH",
            f"https://api.notion.com/v1/pages/{page_id}",
            json=payload,
        )

    def validate_page_ids(self, page_ids, max_items=MAX_BATCH_SIZE):
        if not isinstance(page_ids, list):
            raise NotionManagerError("page_ids 必须是数组。")
        unique_ids = []
        seen = set()
        for page_id in page_ids:
            clean_id = str(page_id or "").strip()
            if clean_id and clean_id not in seen:
                seen.add(clean_id)
                unique_ids.append(clean_id)
        if not unique_ids:
            raise NotionManagerError("请选择至少一篇笔记。")
        if len(unique_ids) > max_items:
            raise NotionManagerError(f"单次最多处理 {max_items} 篇笔记。")
        return unique_ids

    def archive_note(self, page_id):
        page_id = (page_id or "").strip()
        if not page_id:
            raise NotionManagerError("缺少要删除的笔记 ID。")

        page = self.get_page(page_id)
        title = read_title(page.get("properties", {}).get(TITLE_PROP, {})) or "未命名笔记"
        if page.get("archived") or page.get("in_trash"):
            return {
                "ok": True,
                "archived": False,
                "page_id": page_id,
                "title": title,
                "message": f"《{title}》已经在回收站中。",
            }

        self.request(
            "PATCH",
            f"https://api.notion.com/v1/pages/{page_id}",
            json={"archived": True},
        )
        return {
            "ok": True,
            "archived": True,
            "page_id": page_id,
            "title": title,
            "message": f"已将《{title}》移入 Notion 回收站。",
        }

    def add_pages_to_album(self, page_ids, album_name, mode="append"):
        if mode not in {"append", "move", "remove"}:
            raise NotionManagerError("专辑操作仅支持追加、移动或移除。")

        page_ids = self.validate_page_ids(page_ids)
        resolved_album_name, target_album_id = self.resolve_album(album_name)
        updated = 0
        skipped = 0
        failed = 0
        failures = []

        for page_id in page_ids:
            try:
                page = self.get_page(page_id)
                relation_prop = page.get("properties", {}).get(ALBUM_PROP, {})
                if relation_prop.get("has_more"):
                    raise NotionManagerError("该页面已有专辑数量过多，当前版本暂不支持追加。")

                relations = relation_prop.get("relation", [])
                relation_ids = [item.get("id") for item in relations if item.get("id")]
                if mode == "append":
                    if target_album_id in relation_ids:
                        skipped += 1
                        continue
                    new_relation_ids = relation_ids + [target_album_id]
                elif mode == "move":
                    if relation_ids == [target_album_id]:
                        skipped += 1
                        continue
                    new_relation_ids = [target_album_id]
                else:
                    if target_album_id not in relation_ids:
                        skipped += 1
                        continue
                    new_relation_ids = [
                        relation_id
                        for relation_id in relation_ids
                        if relation_id != target_album_id
                    ]

                self.patch_page_properties(
                    page_id,
                    {
                        ALBUM_PROP: {
                            "relation": [
                                {"id": relation_id}
                                for relation_id in new_relation_ids
                            ]
                        }
                    },
                )
                updated += 1
            except Exception as exc:  # Keep batch operations best-effort.
                failed += 1
                failures.append({"page_id": page_id, "error": str(exc)})

        action_text = {
            "append": "追加到",
            "move": "移动到",
            "remove": "从中移除",
        }[mode]
        return {
            "ok": failed == 0,
            "action": "album",
            "mode": mode,
            "album_name": resolved_album_name,
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "failures": failures,
            "message": (
                f"已将 {updated} 篇笔记{action_text}「{resolved_album_name}」，"
                f"{skipped} 篇无需修改，{failed} 篇失败。"
            ),
        }

    def update_pages_status(self, page_ids, status):
        page_ids = self.validate_page_ids(page_ids)
        status = str(status or "").strip()
        if status not in VALID_STATUSES:
            raise NotionManagerError(f"不支持的状态：{status or '空'}")

        updated = 0
        skipped = 0
        failures = []
        for page_id in page_ids:
            try:
                page = self.get_page(page_id)
                current_status = read_status(
                    page.get("properties", {}).get(STATUS_PROP, {})
                )
                if current_status == status:
                    skipped += 1
                    continue
                self.patch_page_properties(
                    page_id,
                    {STATUS_PROP: {"select": {"name": status}}},
                )
                updated += 1
            except Exception as exc:
                failures.append({"page_id": page_id, "error": str(exc)})

        failed = len(failures)
        return {
            "ok": failed == 0,
            "action": "status",
            "status": status,
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "failures": failures,
            "message": (
                f"已将 {updated} 篇笔记改为「{status}」，"
                f"{skipped} 篇无需修改，{failed} 篇失败。"
            ),
        }

    def rerun_ai_classification(self, page_ids):
        page_ids = self.validate_page_ids(page_ids, max_items=MAX_AI_BATCH_SIZE)
        try:
            from xiaohongshu_to_notion_cli import recommend_albums
        except ImportError as exc:
            raise NotionManagerError(f"AI 分类模块加载失败：{exc}") from exc

        updated = 0
        skipped = 0
        failures = []
        classifications = []

        for page_id in page_ids:
            try:
                page = self.get_page(page_id)
                note = self.page_to_note(page)
                candidates = recommend_albums(
                    {
                        "title": note.get("title", ""),
                        "summary": note.get("summary", ""),
                        "author": note.get("author", ""),
                        "tags": note.get("tags", ""),
                    }
                )
                if not candidates:
                    raise NotionManagerError("没有得到有效的专辑候选。")
                chosen = candidates[0]
                album_name, album_id = self.resolve_album(chosen.get("name"))
                if note.get("album_ids") == [album_id]:
                    skipped += 1
                else:
                    self.patch_page_properties(
                        page_id,
                        {ALBUM_PROP: {"relation": [{"id": album_id}]}},
                    )
                    updated += 1
                classifications.append(
                    {
                        "page_id": page_id,
                        "title": note.get("title", ""),
                        "album_name": album_name,
                        "reason": chosen.get("reason", ""),
                    }
                )
            except Exception as exc:
                failures.append({"page_id": page_id, "error": str(exc)})

        failed = len(failures)
        return {
            "ok": failed == 0,
            "action": "ai-classify",
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "failures": failures,
            "classifications": classifications,
            "message": (
                f"AI 分类完成：{updated} 篇已更新，"
                f"{skipped} 篇分类未变化，{failed} 篇失败。"
            ),
        }

    def repair_page_covers(self, page_ids):
        page_ids = self.validate_page_ids(page_ids)
        updated = 0
        failures = []

        for page_id in page_ids:
            try:
                page = self.get_page(page_id)
                props = page.get("properties", {})
                source_url = read_url(props.get(COVER_URL_PROP, {}))
                cached_asset = self.cover_store.get_asset_for_page(page_id)

                if cached_asset:
                    try:
                        self.cover_service.upload_cached_asset(
                            cached_asset["id"],
                            page_id=page_id,
                            force_upload=True,
                        )
                        updated += 1
                        continue
                    except (CoverAssetError, ValueError):
                        if not source_url:
                            source_urls = cached_asset.get("source_urls") or []
                            source_url = source_urls[-1] if source_urls else ""

                if not source_url:
                    source_url = read_cover_url(page)
                if not source_url:
                    raise NotionManagerError("没有可用于修复的封面来源。")
                self.cover_service.cache_upload_and_attach(
                    source_url,
                    page_id,
                    force_cache=True,
                    force_upload=True,
                )
                updated += 1
            except Exception as exc:
                failures.append({"page_id": page_id, "error": str(exc)})

        failed = len(failures)
        return {
            "ok": failed == 0,
            "action": "repair-cover",
            "updated": updated,
            "skipped": 0,
            "failed": failed,
            "failures": failures,
            "message": f"已修复 {updated} 篇笔记的封面，{failed} 篇失败。",
        }

    def clean_page_tags(self, page_ids):
        page_ids = self.validate_page_ids(page_ids)
        updated = 0
        skipped = 0
        failures = []

        for page_id in page_ids:
            try:
                page = self.get_page(page_id)
                props = page.get("properties", {})
                original_wild = read_rich_text(props.get(TAGS_PROP, {}))
                original_color = read_multi_select(props.get(COLOR_TAGS_PROP, {}))
                clean_wild = normalize_tags(original_wild)
                clean_color = normalize_tags(original_color)
                clean_wild_text = ", ".join(clean_wild)

                properties = {}
                if clean_wild_text != original_wild:
                    properties[TAGS_PROP] = rich_text_payload(clean_wild_text)
                if clean_color != original_color:
                    properties[COLOR_TAGS_PROP] = {
                        "multi_select": [{"name": tag} for tag in clean_color]
                    }
                if not properties:
                    skipped += 1
                    continue

                self.patch_page_properties(page_id, properties)
                updated += 1
            except Exception as exc:
                failures.append({"page_id": page_id, "error": str(exc)})

        failed = len(failures)
        return {
            "ok": failed == 0,
            "action": "clean-tags",
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "failures": failures,
            "message": (
                f"标签清理完成：{updated} 篇已更新，"
                f"{skipped} 篇无需修改，{failed} 篇失败。"
            ),
        }

    def merge_duplicate_pages(self, page_ids):
        page_ids = self.validate_page_ids(page_ids)
        if len(page_ids) < 2:
            raise NotionManagerError("合并重复记录至少需要选择两篇笔记。")

        pages = []
        failures = []
        for page_id in page_ids:
            try:
                page = self.get_page(page_id)
                note = self.page_to_note(page)
                duplicate_key = canonical_duplicate_key(note)
                if duplicate_key:
                    pages.append((page, note, duplicate_key))
            except Exception as exc:
                failures.append({"page_id": page_id, "error": str(exc)})

        groups = {}
        for page, note, duplicate_key in pages:
            groups.setdefault(duplicate_key, []).append((page, note))

        duplicate_groups = [items for items in groups.values() if len(items) > 1]
        groups_merged = 0
        archived = 0
        merged_details = []

        for items in duplicate_groups:
            try:
                survivor_page, survivor_note = max(
                    items,
                    key=lambda pair: self._note_quality_score(pair[1]),
                )
                duplicate_items = [
                    pair for pair in items
                    if pair[0].get("id") != survivor_page.get("id")
                ]
                properties, cover = self._build_merged_page_update(
                    survivor_page,
                    [pair[0] for pair in duplicate_items],
                )
                self.patch_page(
                    survivor_page["id"],
                    properties=properties,
                    cover=cover,
                )

                archived_ids = []
                for duplicate_page, _ in duplicate_items:
                    duplicate_id = duplicate_page.get("id")
                    self.request(
                        "PATCH",
                        f"https://api.notion.com/v1/pages/{duplicate_id}",
                        json={"archived": True},
                    )
                    archived_ids.append(duplicate_id)
                    archived += 1

                groups_merged += 1
                merged_details.append(
                    {
                        "survivor_id": survivor_page.get("id"),
                        "title": survivor_note.get("title", ""),
                        "archived_ids": archived_ids,
                    }
                )
            except Exception as exc:
                failures.append(
                    {
                        "page_id": items[0][0].get("id", ""),
                        "error": str(exc),
                    }
                )

        failed = len(failures)
        ignored = len(page_ids) - sum(len(items) for items in duplicate_groups)
        return {
            "ok": failed == 0,
            "action": "merge-duplicates",
            "updated": groups_merged,
            "groups_merged": groups_merged,
            "archived": archived,
            "skipped": max(ignored, 0),
            "failed": failed,
            "failures": failures,
            "merged": merged_details,
            "message": (
                f"已合并 {groups_merged} 组重复记录，"
                f"{archived} 篇重复项已移入回收站，"
                f"{max(ignored, 0)} 篇未发现重复，{failed} 项失败。"
            ),
        }

    @staticmethod
    def _note_quality_score(note):
        return (
            min(len(note.get("summary") or ""), 500)
            + min(len(note.get("title") or ""), 100)
            + (50 if note.get("cover") else 0)
            + (30 if note.get("author") else 0)
            + 10 * len(note.get("album_ids") or [])
            + 5 * len(normalize_tags(note.get("tags", "")))
        )

    def _build_merged_page_update(self, survivor_page, duplicate_pages):
        all_pages = [survivor_page] + duplicate_pages
        props_list = [page.get("properties", {}) for page in all_pages]

        def longest_text(property_name, reader):
            values = [reader(props.get(property_name, {})) for props in props_list]
            return max(values, key=len, default="")

        title = longest_text(TITLE_PROP, read_title)
        summary = longest_text(SUMMARY_PROP, read_rich_text)
        author = longest_text(AUTHOR_PROP, read_rich_text)
        source_url = next(
            (
                read_url(props.get(URL_PROP, {}))
                for props in props_list
                if read_url(props.get(URL_PROP, {}))
            ),
            "",
        )
        cover_source = next(
            (
                read_url(props.get(COVER_URL_PROP, {}))
                for props in props_list
                if read_url(props.get(COVER_URL_PROP, {}))
            ),
            "",
        )
        status = next(
            (
                read_status(props.get(STATUS_PROP, {}))
                for props in props_list
                if read_status(props.get(STATUS_PROP, {}))
            ),
            "",
        )

        wild_tags = normalize_tags(
            [
                tag
                for props in props_list
                for tag in normalize_tags(read_rich_text(props.get(TAGS_PROP, {})))
            ]
        )
        color_tags = normalize_tags(
            [
                tag
                for props in props_list
                for tag in read_multi_select(props.get(COLOR_TAGS_PROP, {}))
            ]
        )
        album_ids = list(
            dict.fromkeys(
                item.get("id")
                for props in props_list
                for item in props.get(ALBUM_PROP, {}).get("relation", [])
                if item.get("id")
            )
        )

        properties = {
            TITLE_PROP: title_payload(title),
            SUMMARY_PROP: rich_text_payload(summary),
            AUTHOR_PROP: rich_text_payload(author),
            URL_PROP: {"url": source_url or None},
            COVER_URL_PROP: {"url": cover_source or None},
            TAGS_PROP: rich_text_payload(", ".join(wild_tags)),
            COLOR_TAGS_PROP: {
                "multi_select": [{"name": tag} for tag in color_tags]
            },
            ALBUM_PROP: {
                "relation": [{"id": album_id} for album_id in album_ids]
            },
        }
        if status:
            properties[STATUS_PROP] = {"select": {"name": status}}

        survivor_cover = read_cover_url(survivor_page)
        replacement_cover = None
        if not survivor_cover:
            replacement_cover = next(
                (
                    page.get("cover")
                    for page in duplicate_pages
                    if (page.get("cover") or {}).get("type") == "external"
                    and read_cover_url(page)
                ),
                None,
            )
        return properties, replacement_cover

    def run_batch_action(self, action, payload):
        page_ids = payload.get("page_ids")
        if action == "album":
            return self.add_pages_to_album(
                page_ids,
                payload.get("album_name"),
                mode=payload.get("mode", "append"),
            )
        if action == "status":
            return self.update_pages_status(page_ids, payload.get("status"))
        if action == "ai-classify":
            return self.rerun_ai_classification(page_ids)
        if action == "repair-cover":
            return self.repair_page_covers(page_ids)
        if action == "clean-tags":
            return self.clean_page_tags(page_ids)
        if action == "merge-duplicates":
            return self.merge_duplicate_pages(page_ids)
        raise NotionManagerError(f"不支持的批量操作：{action or '空'}")
