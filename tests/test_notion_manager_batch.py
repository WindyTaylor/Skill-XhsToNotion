import sys
import unittest
from pathlib import Path


PROGRAM_DIR = Path(__file__).resolve().parents[1] / "program"
sys.path.insert(0, str(PROGRAM_DIR))

from notion_manager import (  # noqa: E402
    ALBUM_PROP,
    AUTHOR_PROP,
    COLOR_TAGS_PROP,
    STATUS_PROP,
    SUMMARY_PROP,
    TAGS_PROP,
    TITLE_PROP,
    URL_PROP,
    NotionNoteManager,
    canonical_duplicate_key,
    normalize_tags,
)


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
):
    return {
        "id": page_id,
        "url": f"https://www.notion.so/{page_id}",
        "properties": {
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
        },
    }


class FakeCoverStore:
    def get_local_url_for_page(self, page_id):
        return ""


class BatchManagerTests(unittest.TestCase):
    def make_manager(self, pages):
        manager = NotionNoteManager.__new__(NotionNoteManager)
        manager.album_map = {"专辑 A": "album-a", "专辑 B": "album-b"}
        manager.album_id_to_name = {
            "album-a": "专辑 A",
            "album-b": "专辑 B",
        }
        manager.cover_store = FakeCoverStore()
        manager.get_page = lambda page_id: pages[page_id]
        manager.property_patches = []
        manager.page_patches = []
        manager.archived_ids = []

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

    def test_album_move_replaces_existing_relations(self):
        pages = {
            "page-1": make_page("page-1", album_ids=["album-a"]),
        }
        manager = self.make_manager(pages)

        result = manager.add_pages_to_album(["page-1"], "专辑 B", mode="move")

        self.assertEqual(result["updated"], 1)
        patch = manager.property_patches[0][1]
        self.assertEqual(patch[ALBUM_PROP]["relation"], [{"id": "album-b"}])

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


if __name__ == "__main__":
    unittest.main()
