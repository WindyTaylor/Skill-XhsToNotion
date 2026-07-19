#!/usr/bin/env python3
"""Local web server for the Xiaohongshu Notion note management console."""

import argparse
import json
import mimetypes
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

    def do_GET(self):
        path, query = parse_query(self.path)
        if path == "/api/health":
            self.write_json({"ok": True, "service": "xhs-notion-management-console"})
            return
        if path == "/api/albums":
            self.handle_api(lambda: {"albums": self.manager.list_albums()})
            return
        if path == "/api/notes":
            self.handle_api(lambda: self.manager.query_notes(query))
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
        if path == "/api/notes/batch":
            body = self.read_json_body()
            self.handle_api(
                lambda: self.manager.run_batch_action(
                    body.get("action", ""),
                    body,
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
        self.write_json({"ok": False, "error": "接口不存在。"}, status=HTTPStatus.NOT_FOUND)

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
