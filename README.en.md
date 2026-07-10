# Xiaohongshu to Notion Skill

A Python CLI and Codex/OpenClaw skill for saving Xiaohongshu notes into a Notion content database. Given a Xiaohongshu URL, the tool extracts the note title, summary, author, tags, cover image, and final redirected URL, then writes the result to Notion with duplicate detection and album relation support.

The active implementation lives in `program`. The Edge extension under `references/4.edge_with_notion` is kept as a historical/reference route.

## Features

- Extract note metadata from Xiaohongshu URLs.
- Save title, URL, summary, author, status, tags, cover, and album relation to Notion.
- Detect duplicate notes by Xiaohongshu note id before creating pages.
- Use DeepSeek through an OpenAI-compatible API to infer the best album candidates.
- Fall back to local keyword-based album matching when DeepSeek is unavailable.
- Append tags, update the album, or select an album from the latest candidate list after saving.
- Refresh album mappings from the Notion album database.
- Work as a Codex/OpenClaw skill for QQ Xiaohongshu card links.

## Project Layout

```text
.
├── program/                         # Main Python CLI and skill implementation
│   ├── xiaohongshu_to_notion_cli.py  # Main CLI entrypoint
│   ├── local_extractor.py            # Xiaohongshu page extractor
│   ├── update_album_map.py           # Refresh Notion album relation mapping
│   ├── configure.py                  # Local configuration helper
│   ├── config_template.json          # Configuration template
│   ├── album_map.json                # Album name to Notion page id mapping
│   ├── album_descriptions.json       # Album descriptions for LLM routing
│   ├── SKILL.md                      # Codex/OpenClaw skill instructions
│   └── README.md                     # Detailed Chinese documentation
├── references/                       # Edge extension and historical scripts
├── doc/                              # Project notes and setup docs
└── agent.md                          # Collaboration notes
```

## Requirements

- Python 3.10 or later.
- Python package: `requests`.
- A Notion integration token.
- A Notion content database id.
- Optional: a DeepSeek API key for LLM-based album routing.

Install the Python dependency:

```powershell
python -m pip install requests
```

## Configuration

Create a local config file from the template:

```powershell
Copy-Item program/config_template.json program/config.json
python program/configure.py --api-key "ntn_xxx" --db-url "https://www.notion.so/..."
```

Environment variables are also supported:

```powershell
$env:NOTION_API_KEY="ntn_xxx"
$env:NOTION_DATABASE_ID="your_database_id"
$env:DEEPSEEK_API_KEY="sk_xxx"
```

Supported configuration keys:

| Key | Required | Description |
| --- | --- | --- |
| `NOTION_API_KEY` | Yes | Notion integration token |
| `NOTION_DATABASE_ID` | Yes | Notion content database id |
| `NOTION_VERSION` | No | Notion API version, default in template: `2025-09-03` |
| `DEEPSEEK_API_KEY` | No | Enables LLM album routing |
| `DEEPSEEK_BASE_URL` | No | Default: `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | No | Default: `deepseek-chat` |

`program/config.json` contains private credentials and should stay local. Commit `program/config_template.json` only.

## Notion Schema

The target Notion database should contain these properties:

| Property | Type | Purpose |
| --- | --- | --- |
| `标题` | Title | Note title |
| `小红书链接` | URL | Original or final Xiaohongshu URL |
| `简介` | Rich text | Note text or summary |
| `作者` | Rich text | Author name |
| `状态` | Select | Defaults to `待阅读` |
| `野生标签` | Rich text | Extracted or manually appended tags |
| `库B：专辑标签库` | Relation | Relation to the album database |

## Usage

Save a Xiaohongshu note:

```powershell
python program/xiaohongshu_to_notion_cli.py --url "https://www.xiaohongshu.com/explore/..."
```

Save with manual fallback fields:

```powershell
python program/xiaohongshu_to_notion_cli.py `
  --url "https://www.xiaohongshu.com/explore/..." `
  --title "Note title" `
  --summary "Note summary" `
  --author "Author name" `
  --tags "tag1,tag2"
```

Append tags to the latest saved or matched Notion page:

```powershell
python program/xiaohongshu_to_notion_cli.py --append-tags "new tag,todo"
```

Update the album of the latest saved or matched Notion page:

```powershell
python program/xiaohongshu_to_notion_cli.py --update-album "学习AI编程"
```

Select an album from the latest candidate list:

```powershell
python program/xiaohongshu_to_notion_cli.py --select-album-candidate 2
```

Refresh album mapping from Notion:

```powershell
python program/update_album_map.py
```

## QQ Card Notes

When the skill receives a Xiaohongshu QQ card, pass the full `jump_url` to the CLI. Do not strip query parameters such as `xsec_token`, `xsec_source`, `share_id`, `share_channel`, or `xhsshare`.

QQ card preview fields such as `title`, `desc`, and `tag` may be truncated. Use them only as fallback values when page extraction fails.

## More Documentation

- [program/README.md](program/README.md): detailed Chinese CLI and skill documentation.
- [program/SKILL.md](program/SKILL.md): Codex/OpenClaw skill invocation rules.
- [doc/PROJECT_SUMMARY.md](doc/PROJECT_SUMMARY.md): project route and current status.
- [doc/PROJECT_WORKSPACE_GUIDE.md](doc/PROJECT_WORKSPACE_GUIDE.md): workspace rules for future work.
