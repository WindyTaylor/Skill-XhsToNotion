# Agent Fast Context

Updated: 2026-08-05

This is the short entrypoint for routine Codex work in this project. Read this first. Open `doc/PROJECT_WORKSPACE_GUIDE.md` only when directory ownership, write boundaries, Notion schema changes, or broad project context are needed.

## Current Mainline

The active route is `program`: Python CLI + local management console + Notion integration for saving Xiaohongshu notes and organizing collected reference images.

The local console runs at:

```text
http://127.0.0.1:8765
```

Do not commit local credentials or runtime data.

## High-Value Files

- CLI entry: `program/xiaohongshu_to_notion_cli.py`
- Notion manager: `program/notion_manager.py`
- Local server: `program/manage_server.py`
- Shared cover handling: `program/cover_assets.py`
- Main console UI: `program/web/index.html`, `program/web/app.js`, `program/web/styles.css`
- Materials page: `program/web/materials.html`, `program/web/materials.js`, `program/web/styles.css`
- Project docs: `doc/PROJECT_SUMMARY.md`, `doc/MATERIALS_PAGE_DESIGN_README.md`
- Full workspace rules: `doc/PROJECT_WORKSPACE_GUIDE.md`

## Materials Page Notes

`materials.html` is the current reference-image management page.

- Positive tag filters are AND across groups and OR inside a group.
- Exclude tags match across all tags plus title, author, and source title.
- Photo folders are local browser presets stored in `localStorage["materials_photo_folders"]`.
- Image drag order is one global browser-local order stored in `localStorage["materials_card_order"]`.
- When dragging inside a filtered view, only the visible subset is reordered and embedded back into the global order.
- The detail panel can add/remove tags through `/api/materials/photo/update`.
- `app.js` is loaded lazily only when the user clicks "重新拆图".

## Verification Commands

Use the smallest relevant check:

```powershell
node --check program\web\materials.js
python -m pytest
git diff --check
```

## Avoid Reading Unless Needed

- `program/data/`
- `program/config.json`
- `.git/`
- `references/` unless the task is about the historical Edge extension route
- Generated caches such as `__pycache__/`, `.pytest_cache/`
- Runtime logs and pid files

## Cleanup Policy

Safe to remove when present:

- `*.log`, `*.err.log`, `*.pid`
- `__pycache__/`, `.pytest_cache/`
- ad-hoc debug HTML files that are not referenced by code or docs
- old installed-copy folders after confirming they are ignored and not the active `program` source

Keep:

- `program/config.json`
- `program/data/`
- committed docs, tests, source files, and reference design assets under `doc/`
