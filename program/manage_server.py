#!/usr/bin/env python3
"""Local web server for the Xiaohongshu Notion note management console."""

import argparse
import base64
import hmac
import json
import mimetypes
import os
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from cover_assets import CoverAssetStore, as_bool
from notion_manager import NotionAPIError, NotionConfigError, NotionManagerError, NotionNoteManager


HOST = "127.0.0.1"
PORT = 8765
PROGRAM_DIR = Path(__file__).parent
WEB_DIR = PROGRAM_DIR / "web"
CONFIG_FILE = PROGRAM_DIR / "config.json"
AUTH_REALM = "xhs-notion-console"
AUTH_EXEMPT_PATHS = {
    "/api/health",
    "/icon.svg",
    "/manifest.webmanifest",
}


mimetypes.add_type("application/manifest+json", ".webmanifest")


def load_server_config():
    if not CONFIG_FILE.exists():
        return {}
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8-sig") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def load_auth_config():
    file_config = load_server_config()
    username = (
        os.getenv("ADMIN_USERNAME")
        or file_config.get("ADMIN_USERNAME")
        or "admin"
    )
    password = os.getenv("ADMIN_PASSWORD") or file_config.get("ADMIN_PASSWORD") or ""
    return {
        "enabled": bool(str(password).strip()),
        "username": str(username or "admin"),
        "password": str(password),
    }


def parse_query(path):
    parsed = urlparse(path)
    query = {
        key: values[-1]
        for key, values in parse_qs(parsed.query, keep_blank_values=True).items()
    }
    return parsed.path, query


class ManagementConsoleHandler(BaseHTTPRequestHandler):
    server_version = "XhsNotionManager/0.1"

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), fmt % args))

    @property
    def manager(self):
        return self.server.manager

    @property
    def auth_config(self):
        return self.server.auth_config

    def do_GET(self):
        path, query = parse_query(self.path)
        if not self.is_authorized(path):
            self.request_auth()
            return
        if path == "/api/health":
            self.write_json({"ok": True, "service": "xhs-notion-management-console"})
            return
        if path == "/api/albums":
            self.handle_api(lambda: {"albums": self.manager.list_albums()})
            return
        if path == "/api/album-descriptions":
            self.handle_api(self.manager.list_album_descriptions)
            return
        if path == "/api/notes":
            self.handle_api(lambda: self.manager.query_notes(query))
            return
        if path == "/api/notes/images":
            refresh = as_bool(query.get("refresh"), default=False)
            self.handle_api(
                lambda: self.manager.list_note_images(
                    query.get("page_id", ""),
                    refresh=refresh,
                )
            )
            return
        if path == "/api/materials/photo":
            self.handle_api(lambda: self.manager.query_photo_materials(query))
            return
        if path == "/api/debug/cover":
            try:
                limit = int(query.get("limit", "3"))
            except ValueError:
                limit = 3
            self.handle_api(lambda: {"pages": self.manager.debug_first_page_cover(limit=limit)})
            return
        if path.startswith("/covers/"):
            self.serve_cover(path)
            return
        self.serve_static(path)

    def do_POST(self):
        path, _ = parse_query(self.path)
        if not self.is_authorized(path):
            self.request_auth()
            return
        if path == "/api/albums":
            body = self.read_json_body()
            action = body.get("action", "")
            if action == "create":
                self.handle_api(
                    lambda: self.manager.create_album(
                        body.get("album_name", ""),
                        body.get("domain", ""),
                    )
                )
            elif action == "rename":
                self.handle_api(
                    lambda: self.manager.rename_album(
                        body.get("album_name", ""),
                        body.get("new_name", ""),
                    )
                )
            else:
                self.write_json(
                    {"ok": False, "error": "不支持的专辑操作。"},
                    status=HTTPStatus.BAD_REQUEST,
                )
            return
        if path == "/api/albums/order":
            body = self.read_json_body()
            self.handle_api(
                lambda: self.manager.update_album_order(
                    body.get("album_ids") or body.get("album_names", [])
                )
            )
            return
        if path == "/api/notes/batch":
            body = self.read_json_body()
            self.handle_api(
                lambda: self.manager.run_batch_action(
                    body.get("action", ""),
                    body,
                )
            )
            return
        if path == "/api/album-descriptions":
            body = self.read_json_body()
            self.handle_api(
                lambda: self.manager.update_album_description(
                    body.get("album_name", ""),
                    body.get("description", ""),
                )
            )
            return
        if path == "/api/notes/add-to-album":
            self.handle_api(lambda: self.manager.add_pages_to_album(**self.read_json_body()))
            return
        if path == "/api/notes/delete":
            self.handle_api(lambda: self.manager.archive_note(self.read_json_body().get("page_id", "")))
            return
        if path == "/api/covers/cache":
            body = self.read_json_body()
            self.handle_api(
                lambda: self.manager.cache_cover_asset(
                    body.get("source_url", ""),
                    page_id=body.get("page_id", ""),
                    upload_to_notion=as_bool(body.get("upload_to_notion"), default=False),
                )
            )
            return
        if path == "/api/materials/photo":
            self.handle_api(lambda: self.manager.create_photo_materials(self.read_json_body()))
            return
        if path == "/api/notes/cover":
            body = self.read_json_body()
            self.handle_api(
                lambda: {
                    "ok": True,
                    "page_id": body.get("page_id", ""),
                    "cover": self.manager.refresh_cover_local(body.get("page_id", "")),
                }
            )
            return
        if path == "/api/materials/photo/update":
            body = self.read_json_body()
            self.handle_api(lambda: self.manager.update_photo_material_tag(
                page_id=body.get("page_id", ""),
                tag_group=body.get("tag_group", ""),
                tag_value=body.get("tag_value", ""),
                action=body.get("action", "remove"),  # remove | add
            ))
            return
        self.write_json({"ok": False, "error": "接口不存在。"}, status=HTTPStatus.NOT_FOUND)

    def is_authorized(self, path):
        auth = self.auth_config
        if path in AUTH_EXEMPT_PATHS or path.startswith("/covers/"):
            return True
        if not auth.get("enabled"):
            return self.is_local_request()

        header = self.headers.get("Authorization", "")
        scheme, _, credentials = header.partition(" ")
        if scheme.lower() != "basic" or not credentials:
            return False

        try:
            decoded = base64.b64decode(credentials, validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError):
            return False
        username, separator, password = decoded.partition(":")
        if not separator:
            return False

        return (
            hmac.compare_digest(username, auth.get("username", ""))
            and hmac.compare_digest(password, auth.get("password", ""))
        )

    def is_local_request(self):
        host = self.headers.get("Host", "").split(":", 1)[0].strip().lower()
        return host in {"127.0.0.1", "localhost", "::1"} or host.endswith(".localhost")

    def request_auth(self):
        auth_enabled = self.auth_config.get("enabled")
        status = HTTPStatus.UNAUTHORIZED if auth_enabled else HTTPStatus.FORBIDDEN
        error = (
            "需要登录后访问管理台。"
            if auth_enabled
            else "公网或局域网访问前必须先设置 ADMIN_PASSWORD。"
        )
        body = json.dumps(
            {"ok": False, "error": error},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(status)
        if auth_enabled:
            self.send_header("WWW-Authenticate", f'Basic realm="{AUTH_REALM}", charset="UTF-8"')
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Vary", "Authorization")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self, callback):
        try:
            self.write_json(callback())
        except NotionConfigError as exc:
            self.write_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except NotionAPIError as exc:
            self.write_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
        except NotionManagerError as exc:
            self.write_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
        except Exception as exc:
            self.write_json({"ok": False, "error": f"服务异常: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise NotionManagerError(f"请求 JSON 格式错误: {exc}") from exc
        if not isinstance(data, dict):
            raise NotionManagerError("请求体必须是 JSON 对象。")
        return data

    def write_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path):
        if path in {"", "/"}:
            path = "/index.html"

        requested = (WEB_DIR / path.lstrip("/")).resolve()
        try:
            requested.relative_to(WEB_DIR.resolve())
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN)
            return

        if not requested.exists() or not requested.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_type = mimetypes.guess_type(str(requested))[0] or "application/octet-stream"
        body = requested.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_cover(self, path):
        store = CoverAssetStore()
        cover_root = store.cover_dir.resolve()
        requested = (cover_root / path.removeprefix("/covers/")).resolve()
        try:
            requested.relative_to(cover_root)
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN)
            return

        if not requested.exists() or not requested.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_type = mimetypes.guess_type(str(requested))[0] or "application/octet-stream"
        body = requested.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class ManagementConsoleServer(ThreadingHTTPServer):
    def __init__(self, server_address, request_handler_class):
        super().__init__(server_address, request_handler_class)
        self.auth_config = load_auth_config()
        self.manager = NotionNoteManager()


def main():
    parser = argparse.ArgumentParser(description="启动小红书 Notion 收藏管理台")
    parser.add_argument("--host", default=HOST, help="监听地址，默认只监听 127.0.0.1")
    parser.add_argument("--port", type=int, default=PORT, help="监听端口，默认 8765")
    args = parser.parse_args()

    if args.host != HOST:
        print("[WARN] 当前服务将不只限本机访问。公网部署前请先增加认证。")

    server = ManagementConsoleServer((args.host, args.port), ManagementConsoleHandler)
    url = f"http://{args.host}:{args.port}"
    if server.auth_config.get("enabled"):
        print(f"[OK] 管理台访问保护已启用，登录用户：{server.auth_config.get('username')}")
    else:
        print("[WARN] 管理台未启用访问保护。公网 Tunnel 前请设置 ADMIN_PASSWORD。")
    print(f"[OK] 小红书收藏管理台已启动: {url}")
    print("[INFO] 在 Notion 页面中使用 /embed 嵌入该地址；停止服务请按 Ctrl+C。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] 正在停止服务...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
