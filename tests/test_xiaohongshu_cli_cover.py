import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


PROGRAM_DIR = Path(__file__).resolve().parents[1] / "program"
sys.path.insert(0, str(PROGRAM_DIR))

import xiaohongshu_to_notion_cli as cli  # noqa: E402
from cover_assets import CoverAssetStore  # noqa: E402


class FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.posts = []

    def post(self, url, **kwargs):
        self.posts.append({"url": url, **kwargs})
        return self.responses.pop(0)


def make_saver():
    saver = cli.NotionSaver.__new__(cli.NotionSaver)
    saver.notion_api_key = "ntn_test"
    saver.notion_database_id = "database-test"
    saver.notion_data_source_id = "data-source-test"
    saver.notion_version = "2026-03-11"
    saver.notion_timeout = 1
    saver.verify_ssl = False
    saver.cover_cache_enabled = False
    saver.cover_upload_to_notion = True
    saver.persist_cover_for_page = lambda page_id, cover_url: None
    saver.persist_images_for_page = lambda page_id, image_urls: []
    return saver


class NotionSaverCoverTests(unittest.TestCase):
    def test_external_cover_payload_upgrades_http_to_https_for_notion(self):
        saver = make_saver()

        payload = saver.external_cover_payload("http://sns-webpic-qc.xhscdn.com/a.webp")

        self.assertEqual(
            payload,
            {
                "type": "external",
                "external": {"url": "https://sns-webpic-qc.xhscdn.com/a.webp"},
            },
        )

    def test_save_includes_external_cover_before_upload_fallback(self):
        session = FakeSession(
            [
                FakeResponse(
                    200,
                    {"id": "page-1", "created_time": "2026-08-04T00:00:00.000Z"},
                )
            ]
        )
        saver = make_saver()

        with (
            patch("requests.Session", return_value=session),
            patch.object(cli, "resolve_album", return_value=("未设置", "")),
            patch.object(cli, "print_album_candidates", return_value=None),
        ):
            page_id = saver.save_to_notion(
                {
                    "title": "测试笔记",
                    "url": "https://www.xiaohongshu.com/explore/abc123",
                    "cover": "https://sns-img-qc.xhscdn.com/cover.jpg",
                }
            )

        self.assertEqual(page_id, "page-1")
        self.assertEqual(
            session.posts[0]["json"]["cover"],
            {
                "type": "external",
                "external": {"url": "https://sns-img-qc.xhscdn.com/cover.jpg"},
            },
        )
        self.assertEqual(
            session.posts[0]["json"]["properties"]["封面"],
            {"url": "https://sns-img-qc.xhscdn.com/cover.jpg"},
        )

    def test_save_without_album_does_not_write_default_album_relation(self):
        session = FakeSession(
            [
                FakeResponse(
                    200,
                    {"id": "page-no-album", "created_time": "2026-08-04T00:00:00.000Z"},
                )
            ]
        )
        saver = make_saver()

        with (
            patch("requests.Session", return_value=session),
            patch.object(cli, "print_album_candidates", return_value=None),
        ):
            page_id = saver.save_to_notion(
                {
                    "title": "测试笔记",
                    "url": "https://www.xiaohongshu.com/explore/abc123",
                    "cover": "https://sns-img-qc.xhscdn.com/cover.jpg",
                }
            )

        self.assertEqual(page_id, "page-no-album")
        self.assertNotIn("库B：专辑标签库", session.posts[0]["json"]["properties"])

    def test_recommend_albums_keywords_mode_skips_deepseek(self):
        expected = [{"name": "未分类收件箱", "id": "album-id"}]

        with (
            patch.object(cli, "recommend_albums_with_llm") as mock_llm,
            patch.object(cli, "recommend_albums_by_keywords", return_value=expected) as mock_keywords,
        ):
            result = cli.recommend_albums({"title": "测试笔记"}, mode="keywords")

        self.assertEqual(result, expected)
        mock_llm.assert_not_called()
        mock_keywords.assert_called_once()

    def test_save_retries_without_initial_cover_when_notion_rejects_url(self):
        session = FakeSession(
            [
                FakeResponse(400, text='{"message":"Invalid cover URL"}'),
                FakeResponse(
                    200,
                    {"id": "page-2", "created_time": "2026-08-04T00:00:00.000Z"},
                ),
            ]
        )
        saver = make_saver()

        with (
            patch("requests.Session", return_value=session),
            patch.object(cli, "resolve_album", return_value=("未设置", "")),
            patch.object(cli, "print_album_candidates", return_value=None),
        ):
            page_id = saver.save_to_notion(
                {
                    "title": "测试笔记",
                    "url": "https://www.xiaohongshu.com/explore/abc123",
                    "cover": "https://example.invalid/cover.jpg",
                }
            )

        self.assertEqual(page_id, "page-2")
        self.assertIn("cover", session.posts[0]["json"])
        self.assertNotIn("cover", session.posts[1]["json"])

    def test_save_uploads_local_cover_file_after_page_create(self):
        session = FakeSession(
            [
                FakeResponse(
                    200,
                    {"id": "page-3", "created_time": "2026-08-04T00:00:00.000Z"},
                )
            ]
        )
        saver = make_saver()
        calls = []
        saver.persist_cover_file_for_page = lambda page_id, cover_file: calls.append((page_id, cover_file))

        with (
            patch("requests.Session", return_value=session),
            patch.object(cli, "resolve_album", return_value=("未设置", "")),
            patch.object(cli, "print_album_candidates", return_value=None),
        ):
            page_id = saver.save_to_notion(
                {
                    "title": "测试笔记",
                    "url": "https://www.xiaohongshu.com/explore/abc123",
                    "cover_file": r"C:\temp\cover.png",
                }
            )

        self.assertEqual(page_id, "page-3")
        self.assertEqual(calls, [("page-3", r"C:\temp\cover.png")])
        self.assertNotIn("cover", session.posts[0]["json"])

    def test_pending_cover_note_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            pending = Path(tmp) / "pending_cover_note.json"
            with patch.object(cli, "PENDING_COVER_FILE", pending):
                cli.write_pending_cover_note(
                    {
                        "url": "https://www.xiaohongshu.com/explore/abc123",
                        "title": "待补封面",
                    },
                    note_id="abc123",
                )
                self.assertEqual(cli.read_pending_cover_note()["note_id"], "abc123")
                cli.clear_pending_cover_note()
                self.assertIsNone(cli.read_pending_cover_note())

    def test_cover_asset_store_can_cache_local_image_file(self):
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
            b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
            b"\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
            b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            image_path = root / "cover.png"
            image_path.write_bytes(png_bytes)
            store = CoverAssetStore(
                cover_dir=root / "covers",
                index_file=root / "cover_assets.json",
            )

            asset = store.cache_from_file(image_path, page_id="page-local")

            self.assertEqual(asset["content_type"], "image/png")
            self.assertIn("page-local", asset["page_ids"])
            self.assertTrue((root / asset["relative_path"]).exists())

    def test_check_duplicate_ignores_archived_and_trashed_pages(self):
        saver = make_saver()

        with patch(
            "requests.post",
            return_value=FakeResponse(
                200,
                {
                    "results": [
                        {"id": "archived-page", "archived": True},
                        {"id": "trashed-page", "in_trash": True},
                    ]
                },
            ),
        ):
            self.assertFalse(saver.check_duplicate("abc123"))

    def test_check_duplicate_returns_first_active_page(self):
        saver = make_saver()

        with patch(
            "requests.post",
            return_value=FakeResponse(
                200,
                {
                    "results": [
                        {"id": "archived-page", "archived": True},
                        {"id": "active-page", "archived": False, "in_trash": False},
                    ]
                },
            ),
        ):
            self.assertEqual(saver.check_duplicate("abc123"), "active-page")

    def test_check_duplicate_resolves_data_source_for_new_notion_api(self):
        saver = make_saver()
        saver.notion_data_source_id = ""

        with (
            patch(
                "requests.get",
                return_value=FakeResponse(
                    200,
                    {"data_sources": [{"id": "resolved-source"}]},
                ),
            ) as mock_get,
            patch(
                "requests.post",
                return_value=FakeResponse(
                    200,
                    {"results": [{"id": "active-page", "archived": False}]},
                ),
            ) as mock_post,
        ):
            self.assertEqual(saver.check_duplicate("abc123"), "active-page")

        mock_get.assert_called_once()
        self.assertIn("/v1/data_sources/resolved-source/query", mock_post.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
