import sys
import tempfile
import unittest
from pathlib import Path


PROGRAM_DIR = Path(__file__).resolve().parents[1] / "program"
sys.path.insert(0, str(PROGRAM_DIR))

from notion_manager import (  # noqa: E402
    ALBUM_PROP,
    AUTHOR_PROP,
    COLOR_TAGS_PROP,
    COVER_URL_PROP,
    STATUS_PROP,
    SUMMARY_PROP,
    TAGS_PROP,
    TITLE_PROP,
    URL_PROP,
    VALID_STATUSES,
    NotionNoteManager,
    canonical_duplicate_key,
    normalize_tags,
    split_filter_terms,
)
from cover_assets import parse_data_image_url  # noqa: E402


def title_property(value):
    return {"title": [{"plain_text": value}]}


def rich_text_property(value):
    return {"rich_text": [{"plain_text": value}]} if value else {"rich_text": []}


def make_page(
    page_id,
    *,
    title="测试笔记",
    url="https://www.xiaohongshu.com/explore/abc123",
    summary="",
    author="作者",
    tags="",
    color_tags=None,
    status="待阅读",
    album_ids=None,
    cover_source="",
):
    properties = {
        TITLE_PROP: title_property(title),
        URL_PROP: {"url": url},
        SUMMARY_PROP: rich_text_property(summary),
        AUTHOR_PROP: rich_text_property(author),
        TAGS_PROP: rich_text_property(tags),
        COLOR_TAGS_PROP: {
            "multi_select": [{"name": value} for value in (color_tags or [])]
        },
        STATUS_PROP: {"select": {"name": status}},
        ALBUM_PROP: {
            "relation": [{"id": value} for value in (album_ids or [])],
            "has_more": False,
        },
    }
    if cover_source:
        properties[COVER_URL_PROP] = {"url": cover_source}
    return {
        "id": page_id,
        "url": f"https://www.notion.so/{page_id}",
        "properties": properties,
    }


class FakeCoverStore:
    def get_local_url_for_page(self, page_id):
        return ""

    def get_asset_for_page(self, page_id):
        return None


class CoverAssetDataUrlTests(unittest.TestCase):
    def test_parse_data_image_url_decodes_base64_image(self):
        content, content_type = parse_data_image_url(
            "data:image/png;base64,iVBORw0KGgo="
        )
        self.assertEqual(content_type, "image/png")
        self.assertEqual(content, b"\x89PNG\r\n\x1a\n")


class FakeCoverService:
    def __init__(self):
        self.cache_upload_calls = []
        self.upload_cached_calls = []

    def cache_upload_and_attach(
        self,
        source_url,
        page_id,
        force_cache=False,
        force_upload=False,
    ):
        self.cache_upload_calls.append(
            {
                "source_url": source_url,
                "page_id": page_id,
                "force_cache": force_cache,
                "force_upload": force_upload,
            }
        )
        return {"id": "asset-1", "source_urls": [source_url]}

    def upload_cached_asset(self, asset_id, page_id="", force_upload=False):
        self.upload_cached_calls.append(
            {
                "asset_id": asset_id,
                "page_id": page_id,
                "force_upload": force_upload,
            }
        )
        return {"id": asset_id}


class BatchManagerTests(unittest.TestCase):
    def make_manager(self, pages):
        manager = NotionNoteManager.__new__(NotionNoteManager)
        manager._temp_dir = tempfile.TemporaryDirectory()
        manager.album_map = {"专辑 A": "album-a", "专辑 B": "album-b"}
        manager.album_domains_file = PROGRAM_DIR / "album_domains.json"
        manager.album_order_file = Path(manager._temp_dir.name) / "album_order.json"
        manager.album_id_to_name = {
            "album-a": "专辑 A",
            "album-b": "专辑 B",
        }
        manager.cover_store = FakeCoverStore()
        manager.cover_service = FakeCoverService()
        manager.xhs_fetch_min_interval = 0
        manager.xhs_image_download_interval = 0
        manager.get_page = lambda page_id: pages[page_id]
        manager.property_patches = []
        manager.page_patches = []
        manager.archived_ids = []
        manager.wait_for_xhs_request = lambda min_interval: None

        def patch_page_properties(page_id, properties):
            manager.property_patches.append((page_id, properties))
            return {}

        def patch_page(page_id, properties=None, cover=None):
            manager.page_patches.append((page_id, properties, cover))
            return {}

        def request(method, url, **kwargs):
            if kwargs.get("json", {}).get("archived"):
                manager.archived_ids.append(url.rsplit("/", 1)[-1])
            return {}

        manager.patch_page_properties = patch_page_properties
        manager.patch_page = patch_page
        manager.request = request
        return manager

    def test_normalize_tags_removes_placeholders_and_duplicates(self):
        self.assertEqual(
            normalize_tags(" AI, #AI，null； 摄影 \n undefined "),
            ["AI", "摄影"],
        )

    def test_canonical_duplicate_key_ignores_xhs_query_parameters(self):
        first = canonical_duplicate_key(
            {"url": "https://www.xiaohongshu.com/explore/ABC123?xsec_token=1"}
        )
        second = canonical_duplicate_key(
            {"url": "https://www.xiaohongshu.com/discovery/item/abc123?source=share"}
        )
        board = canonical_duplicate_key(
            {"url": "https://www.xiaohongshu.com/board/board-id/abc123?source=share"}
        )
        self.assertEqual(first, "xhs:abc123")
        self.assertEqual(first, second)
        self.assertEqual(first, board)

    def test_split_filter_terms_accepts_ascii_and_fullwidth_plus(self):
        self.assertEqual(
            split_filter_terms(" 日系 + 制服＋日系 +  "),
            ["日系", "制服"],
        )

    def test_page_to_note_uses_cover_source_when_page_cover_is_missing(self):
        manager = self.make_manager({})
        note = manager.page_to_note(
            make_page(
                "page-1",
                cover_source="http://sns-webpic-qc.xhscdn.com/cover.webp",
            )
        )

        self.assertEqual(
            note["cover"],
            "https://sns-webpic-qc.xhscdn.com/cover.webp",
        )
        self.assertEqual(
            note["cover_source"],
            "https://sns-webpic-qc.xhscdn.com/cover.webp",
        )

    def test_text_filters_require_every_plus_separated_term(self):
        manager = self.make_manager({})
        note = {
            "title": "日系制服外拍教程",
            "summary": "包含构图和动作建议",
            "author": "摄影师 小林",
            "tags": "日系, 制服, 人像",
            "status": "待阅读",
            "albums": ["专辑 A"],
            "album_ids": ["album-a"],
        }

        self.assertTrue(
            manager.matches_filters(
                note,
                {
                    "q": "构图 + 人像",
                    "title": "日系 + 教程",
                    "author": "摄影师 + 小林",
                    "tag": "日系 + 制服",
                },
            )
        )
        self.assertFalse(
            manager.matches_filters(note, {"tag": "日系 + 旅行"})
        )
        self.assertFalse(
            manager.matches_filters(note, {"title": "日系 + 调色"})
        )

    def test_batch_statuses_are_simplified(self):
        self.assertEqual(VALID_STATUSES, ("待阅读", "已整理", "待执行"))

    def test_status_update_accepts_only_simplified_statuses(self):
        pages = {
            "page-1": make_page("page-1", status="待阅读"),
        }
        manager = self.make_manager(pages)

        result = manager.update_pages_status(["page-1"], "待执行")

        self.assertEqual(result["updated"], 1)
        patch = manager.property_patches[0][1]
        self.assertEqual(patch[STATUS_PROP]["select"]["name"], "待执行")
        with self.assertRaisesRegex(Exception, "不支持的状态"):
            manager.update_pages_status(["page-1"], "已实践")

    def test_album_move_replaces_existing_relations(self):
        pages = {
            "page-1": make_page("page-1", album_ids=["album-a"]),
        }
        manager = self.make_manager(pages)

        result = manager.add_pages_to_album(["page-1"], "专辑 B", mode="move")

        self.assertEqual(result["updated"], 1)
        patch = manager.property_patches[0][1]
        self.assertEqual(patch[ALBUM_PROP]["relation"], [{"id": "album-b"}])

    def test_album_move_does_not_fetch_pages_before_patch(self):
        manager = self.make_manager({})
        manager.get_page = lambda page_id: (_ for _ in ()).throw(
            AssertionError("move mode should not fetch pages")
        )

        result = manager.add_pages_to_album(["page-1", "page-2"], "album-b", mode="move")

        self.assertEqual(result["updated"], 2)
        self.assertEqual(
            [page_id for page_id, _ in manager.property_patches],
            ["page-1", "page-2"],
        )

    def test_album_remove_preserves_other_relations(self):
        pages = {
            "page-1": make_page(
                "page-1",
                album_ids=["album-a", "album-b"],
            ),
        }
        manager = self.make_manager(pages)

        result = manager.add_pages_to_album(["page-1"], "专辑 A", mode="remove")

        self.assertEqual(result["updated"], 1)
        patch = manager.property_patches[0][1]
        self.assertEqual(patch[ALBUM_PROP]["relation"], [{"id": "album-b"}])

    def test_repair_cover_extracts_source_from_note_url_when_cover_is_missing(self):
        pages = {
            "page-1": make_page("page-1"),
        }
        manager = self.make_manager(pages)
        manager.extract_cover_source_from_note_url = (
            lambda note_url: "https://sns-img-qc.xhscdn.com/cover.jpg"
        )

        result = manager.repair_page_covers(["page-1"])

        self.assertEqual(result["updated"], 1)
        self.assertEqual(result["failed"], 0)
        self.assertEqual(
            manager.cover_service.cache_upload_calls,
            [
                {
                    "source_url": "https://sns-img-qc.xhscdn.com/cover.jpg",
                    "page_id": "page-1",
                    "force_cache": True,
                    "force_upload": True,
                }
            ],
        )
        self.assertEqual(
            manager.property_patches[-1],
            (
                "page-1",
                {
                    COVER_URL_PROP: {
                        "url": "https://sns-img-qc.xhscdn.com/cover.jpg"
                    }
                },
            ),
        )

    def test_clean_tags_updates_wild_and_color_tags(self):
        pages = {
            "page-1": make_page(
                "page-1",
                tags="AI, #AI, null, 摄影",
                color_tags=["AI", "AI", "undefined", "摄影"],
            ),
        }
        manager = self.make_manager(pages)

        result = manager.clean_page_tags(["page-1"])

        self.assertEqual(result["updated"], 1)
        patch = manager.property_patches[0][1]
        rich_text = patch[TAGS_PROP]["rich_text"]
        self.assertEqual(rich_text[0]["text"]["content"], "AI, 摄影")
        self.assertEqual(
            patch[COLOR_TAGS_PROP]["multi_select"],
            [{"name": "AI"}, {"name": "摄影"}],
        )

    def test_merge_duplicates_unions_metadata_and_archives_extra_page(self):
        pages = {
            "page-1": make_page(
                "page-1",
                summary="短简介",
                tags="AI",
                color_tags=["AI"],
                album_ids=["album-a"],
            ),
            "page-2": make_page(
                "page-2",
                summary="这是一段更完整的简介",
                tags="摄影",
                color_tags=["摄影"],
                album_ids=["album-b"],
            ),
        }
        manager = self.make_manager(pages)

        result = manager.merge_duplicate_pages(["page-1", "page-2"])

        self.assertEqual(result["groups_merged"], 1)
        self.assertEqual(result["archived"], 1)
        self.assertEqual(len(manager.page_patches), 1)
        _, properties, _ = manager.page_patches[0]
        relation_ids = {
            item["id"] for item in properties[ALBUM_PROP]["relation"]
        }
        self.assertEqual(relation_ids, {"album-a", "album-b"})
        self.assertEqual(
            {
                item["name"]
                for item in properties[COLOR_TAGS_PROP]["multi_select"]
            },
            {"AI", "摄影"},
        )
        self.assertEqual(len(manager.archived_ids), 1)

    def test_album_description_list_includes_unwritten_albums(self):
        manager = self.make_manager({})
        with tempfile.TemporaryDirectory() as temp_dir:
            manager.album_descriptions_file = Path(temp_dir) / "album_descriptions.json"
            manager.album_domains_file = Path(temp_dir) / "album_domains.json"
            manager.album_descriptions_file.write_text(
                '{"专辑 A": "用于收集 A 类内容。"}',
                encoding="utf-8",
            )
            manager.album_domains_file.write_text(
                '{"专辑 A": "🛠️ 硬核技术与职业效能"}',
                encoding="utf-8",
            )

            result = manager.list_album_descriptions()

        self.assertEqual(result["described"], 1)
        self.assertEqual(result["total"], 2)
        descriptions = {
            item["name"]: item["description"]
            for item in result["albums"]
        }
        self.assertEqual(descriptions["专辑 A"], "用于收集 A 类内容。")
        self.assertEqual(descriptions["专辑 B"], "")
        domains = {item["name"]: item["domain"] for item in result["albums"]}
        self.assertEqual(domains["专辑 A"], "🛠️ 硬核技术与职业效能")
        self.assertEqual(domains["专辑 B"], "")

    def test_album_description_can_be_saved_and_cleared(self):
        manager = self.make_manager({})
        with tempfile.TemporaryDirectory() as temp_dir:
            manager.album_descriptions_file = Path(temp_dir) / "album_descriptions.json"
            manager.album_domains_file = Path(temp_dir) / "album_domains.json"

            saved = manager.update_album_description(
                "专辑 A",
                "  用于帮助 AI 识别 A 类内容。  ",
            )
            persisted = manager.list_album_descriptions()
            cleared = manager.update_album_description("专辑 A", "")
            after_clear = manager.list_album_descriptions()

        self.assertEqual(saved["album"]["description"], "用于帮助 AI 识别 A 类内容。")
        self.assertEqual(persisted["described"], 1)
        self.assertEqual(cleared["album"]["description"], "")
        self.assertEqual(after_clear["described"], 0)

    def test_album_can_be_created_and_renamed_without_losing_metadata(self):
        manager = self.make_manager({})
        domain = "🎭 奇趣碎片与小众文化"
        manager.album_source_context = {
            "data_source_id": "album-source",
            "title_property": "专辑名",
            "domain_property": "主领域",
        }
        notion_requests = []

        def request(method, url, **kwargs):
            notion_requests.append((method, url, kwargs.get("json", {})))
            if method == "POST" and url.endswith("/pages"):
                return {"id": "album-new"}
            return {}

        manager.request = request
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            manager.album_map_file = temp_path / "album_map.json"
            manager.album_domains_file = temp_path / "album_domains.json"
            manager.album_descriptions_file = temp_path / "album_descriptions.json"
            manager.album_order_file = temp_path / "album_order.json"
            manager.album_domains_file.write_text(
                '{"专辑 A": "🛠️ 硬核技术与职业效能"}',
                encoding="utf-8",
            )
            manager.album_descriptions_file.write_text(
                '{"新专辑": "用于测试元数据迁移。"}',
                encoding="utf-8",
            )

            created = manager.create_album("新专辑", domain)
            renamed = manager.rename_album("album-new", "新专辑 2")

            saved_map = manager.album_map_file.read_text(encoding="utf-8")
            saved_domains = manager.album_domains_file.read_text(encoding="utf-8")
            saved_descriptions = manager.album_descriptions_file.read_text(
                encoding="utf-8"
            )

        self.assertEqual(created["album"]["id"], "album-new")
        self.assertEqual(created["album"]["domain"], domain)
        create_payload = notion_requests[0][2]
        self.assertEqual(
            create_payload["parent"],
            {"type": "data_source_id", "data_source_id": "album-source"},
        )
        self.assertEqual(
            create_payload["properties"]["主领域"]["select"]["name"],
            domain,
        )
        self.assertEqual(renamed["album"]["name"], "新专辑 2")
        self.assertIn('"新专辑 2": "album-new"', saved_map)
        self.assertNotIn('"新专辑": "album-new"', saved_map)
        self.assertIn('"新专辑 2": "🎭 奇趣碎片与小众文化"', saved_domains)
        self.assertIn('"新专辑 2": "用于测试元数据迁移。"', saved_descriptions)
        self.assertEqual(notion_requests[1][0], "PATCH")
        self.assertTrue(notion_requests[1][1].endswith("/pages/album-new"))

    def test_album_name_must_be_unique(self):
        manager = self.make_manager({})
        with self.assertRaisesRegex(Exception, "专辑名称已存在"):
            manager.validate_new_album_name(" 专辑 A ")


if __name__ == "__main__":
    unittest.main()
