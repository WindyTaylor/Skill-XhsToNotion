#!/usr/bin/env python3
"""Notion note search and album management helpers."""

import json
import os
from pathlib import Path

import requests

try:
    import urllib3
except ImportError:  # pragma: no cover - urllib3 is a requests dependency in normal installs.
    urllib3 = None


PROGRAM_DIR = Path(__file__).parent
CONFIG_FILE = PROGRAM_DIR / "config.json"
ALBUM_MAP_FILE = PROGRAM_DIR / "album_map.json"

TITLE_PROP = "标题"
URL_PROP = "小红书链接"
SUMMARY_PROP = "简介"
AUTHOR_PROP = "作者"
STATUS_PROP = "状态"
TAGS_PROP = "野生标签"
ALBUM_PROP = "库B：专辑标签库"

DEFAULT_NOTION_VERSION = "2025-09-03"
DEFAULT_NOTION_TIMEOUT = 15
DEFAULT_LIMIT = 100
MAX_LIMIT = 200
DEFAULT_MAX_SCAN = 500


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
        "notion_timeout": notion_timeout,
        "verify_ssl": verify_ssl,
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


def read_title(prop):
    return _compact_text("".join(item.get("plain_text", "") for item in prop.get("title", [])))


def read_rich_text(prop):
    return _compact_text("".join(item.get("plain_text", "") for item in prop.get("rich_text", [])))


def read_url(prop):
    return prop.get("url") or ""


def read_status(prop):
    status = prop.get("select") or {}
    return status.get("name") or ""


class NotionNoteManager:
    def __init__(self):
        config = load_config()
        self.notion_api_key = config["notion_api_key"]
        self.database_id = config["notion_database_id"]
        self.data_source_id = config["notion_data_source_id"]
        self.notion_version = config["notion_version"]
        self.notion_timeout = config["notion_timeout"]
        self.verify_ssl = config["verify_ssl"]
        self.session = requests.Session()
        self.album_map = load_album_map()
        self.album_id_to_name = {album_id: name for name, album_id in self.album_map.items()}

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
        return [
            {"name": name, "id": album_id}
            for name, album_id in sorted(self.album_map.items(), key=lambda item: item[0])
        ]

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

        return {
            "id": page.get("id"),
            "title": read_title(props.get(TITLE_PROP, {})),
            "url": read_url(props.get(URL_PROP, {})),
            "summary": read_rich_text(props.get(SUMMARY_PROP, {})),
            "author": read_rich_text(props.get(AUTHOR_PROP, {})),
            "tags": read_rich_text(props.get(TAGS_PROP, {})),
            "status": read_status(props.get(STATUS_PROP, {})),
            "albums": albums,
            "album_ids": album_ids,
            "notion_url": page.get("url", ""),
            "created_time": page.get("created_time", ""),
            "last_edited_time": page.get("last_edited_time", ""),
        }

    def matches_filters(self, note, filters):
        q = _normalize(filters.get("q"))
        title = _normalize(filters.get("title"))
        author = _normalize(filters.get("author"))
        tag = _normalize(filters.get("tag"))
        album = _normalize(filters.get("album"))
        status = _normalize(filters.get("status"))

        title_text = _normalize(note.get("title"))
        summary_text = _normalize(note.get("summary"))
        author_text = _normalize(note.get("author"))
        tag_text = _normalize(note.get("tags"))
        status_text = _normalize(note.get("status"))
        album_text = _normalize(" ".join(note.get("albums") or []))

        if q and q not in " ".join([title_text, summary_text, author_text, tag_text]):
            return False
        if title and title not in title_text:
            return False
        if author and author not in author_text:
            return False
        if tag and tag not in tag_text:
            return False
        if album and album not in album_text:
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

    def add_pages_to_album(self, page_ids, album_name, mode="append"):
        if mode != "append":
            raise NotionManagerError("第一版只支持追加到专辑，暂不支持移动。")

        if not isinstance(page_ids, list) or not page_ids:
            raise NotionManagerError("请选择至少一篇笔记。")

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
                if target_album_id in relation_ids:
                    skipped += 1
                    continue

                new_relations = [{"id": relation_id} for relation_id in relation_ids]
                new_relations.append({"id": target_album_id})
                self.patch_page_properties(
                    page_id,
                    {ALBUM_PROP: {"relation": new_relations}},
                )
                updated += 1
            except Exception as exc:  # Keep batch operations best-effort.
                failed += 1
                failures.append({"page_id": page_id, "error": str(exc)})

        return {
            "ok": failed == 0,
            "album_name": resolved_album_name,
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "failures": failures,
            "message": (
                f"已将 {updated} 篇笔记追加到 {resolved_album_name}，"
                f"{skipped} 篇原本已在该专辑中，{failed} 篇失败。"
            ),
        }
