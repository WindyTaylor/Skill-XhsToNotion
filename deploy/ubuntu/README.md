# Ubuntu deployment template

This folder contains deployment templates for running the management console on an Ubuntu server.

Public traffic should go through Nginx on ports 80/443. The Python app should only listen on `127.0.0.1:8765`.

## Files

- `xhs-notion.env.example`: copy to `/etc/xhs-notion/xhs-notion.env` and fill secrets on the server.
- `xhs-notion.service`: systemd unit for auto-starting the Python app.
- `nginx.example.conf`: Nginx reverse proxy template. Replace `xhs-notion.example.com` with your own domain before enabling it.

Do not copy local `program/config.json` into source control. If you need to migrate it to the server, transfer it privately.

## Assumptions

- The project is deployed to `/opt/xhs-notion`.
- The Python virtual environment is `/opt/xhs-notion/.venv`.
- The service runs as the system user `xhsnotion`.
- The app listens only on `127.0.0.1:8765`; Nginx is optional and only needed for domain access.
- Cover cache files use the default `program/data/covers` path unless `COVER_CACHE_DIR` is set. Make sure `xhsnotion` can write to `/opt/xhs-notion`.

## Deploy

```bash
# 1. Create service user and directories.
sudo useradd --system --home /opt/xhs-notion --shell /usr/sbin/nologin xhsnotion
sudo mkdir -p /opt/xhs-notion /etc/xhs-notion

# 2. Copy or clone this repository into /opt/xhs-notion.
# Example with git:
sudo git clone <repo-url> /opt/xhs-notion

# If /opt/xhs-notion already exists, copy the project contents into it instead.

# 3. Create the virtual environment and install dependencies.
cd /opt/xhs-notion
sudo python3 -m venv .venv
sudo .venv/bin/python -m pip install --upgrade pip
sudo .venv/bin/python -m pip install -r requirements.txt

# 4. Fill server-only environment variables.
sudo cp xhs-notion.env.example /etc/xhs-notion/xhs-notion.env
sudo editor /etc/xhs-notion/xhs-notion.env

# Required in /etc/xhs-notion/xhs-notion.env:
# - ADMIN_PASSWORD
# - NOTION_API_KEY
# - NOTION_DATABASE_ID

# 5. Ensure the service user can write runtime files and cover cache.
sudo chown -R xhsnotion:xhsnotion /opt/xhs-notion

# 6. Install and start the systemd service.
sudo cp xhs-notion.service /etc/systemd/system/xhs-notion.service
sudo systemctl daemon-reload
sudo systemctl enable --now xhs-notion

# 7. Verify local health before enabling Nginx.
curl http://127.0.0.1:8765/api/health
```

## Nginx

For local or internal testing, Nginx is not required. Verify the local service first:

```bash
curl http://127.0.0.1:8765/api/health
```

For domain access, copy `nginx.example.conf`, replace `xhs-notion.example.com` with your test domain, and enable it in Nginx. Configure HTTPS with your preferred certificate tool, such as certbot, after Nginx is serving the template.

## Runtime Data

Do not commit server secrets or runtime files. The server should keep these local:

- `/etc/xhs-notion/xhs-notion.env`
- `/opt/xhs-notion/program/config.json`, if used
- `/opt/xhs-notion/program/data/`
- `/opt/xhs-notion/program/album_map.json`
- `/opt/xhs-notion/program/album_domains.json`
- `/opt/xhs-notion/program/album_order.json`
- `/opt/xhs-notion/program/album_descriptions.json`
