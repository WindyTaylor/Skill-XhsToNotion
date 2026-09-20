# AI Initialization Guide

This repository is an AI-initializable Xiaohongshu-to-Notion skill template.

## Goal

Clone and initialize this skill for the current user's own Notion workspace. Do not use or ask for the author's private Notion IDs, local config, runtime state, screenshots, or deployment logs.

## Ask The User For

1. Notion integration token.
2. Notion content database URL or database ID.
3. Whether they already have an album relation database, or want to start with a simple inbox album.
4. Optional DeepSeek API key, only if they want direct CLI auto-classification with `--auto-classify deepseek`.
5. Optional Ubuntu domain name, only if they want to test server deployment.

Never commit these values to Git.

## Local Setup Commands

```powershell
python -m pip install -r requirements.txt
Copy-Item program/config_template.json program/config.json
python program/configure.py --api-key "<notion-token>" --db-url "<notion-database-url-or-id>"
python program/update_album_map.py
python -m pytest
```

Generated local files such as `program/config.json`, `program/album_map.json`, `program/album_domains.json`, `program/album_order.json`, `program/album_descriptions.json`, `program/last_page_id.txt`, and `program/last_album_candidates.json` are private runtime files and must not be committed.

## Skill Behavior

When this skill is called by an AI agent, the agent should choose the album from the local album mapping and pass it explicitly:

```powershell
python program/xiaohongshu_to_notion_cli.py --url "<xhs-url>" --album "<album-name>"
```

Do not rely on the CLI to call another LLM by default. Direct CLI users may opt in with `--auto-classify deepseek` or `--auto-classify keywords`.

## Ubuntu Test

Use `deploy/ubuntu/` as a template.

Deployment assumptions:

- Project path: `/opt/xhs-notion`
- Virtual environment: `/opt/xhs-notion/.venv`
- systemd user and group: `xhsnotion`
- Local app URL: `http://127.0.0.1:8765`

Before starting the service, make sure the server has:

```bash
/opt/xhs-notion/program
/opt/xhs-notion/.venv
/etc/xhs-notion/xhs-notion.env
```

The service user must own the project directory:

```bash
sudo chown -R xhsnotion:xhsnotion /opt/xhs-notion
```

Fill real server-only values in `/etc/xhs-notion/xhs-notion.env`, especially:

- `ADMIN_PASSWORD`
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`

Cover cache behavior:

- If `COVER_CACHE_DIR` is empty, the app stores covers under `program/data/covers`.
- With the template path, that resolves to `/opt/xhs-notion/program/data/covers`.
- Ensure `xhsnotion` can write to `/opt/xhs-notion`.
- Use `COVER_CACHE_DIR` only if the user wants a different persistent cache location.

Nginx is optional for initial server testing. First verify local health:

```bash
curl http://127.0.0.1:8765/api/health
```

For domain access, replace `xhs-notion.example.com` in `deploy/ubuntu/nginx.example.conf` with the user's test domain and keep secrets out of Git.
