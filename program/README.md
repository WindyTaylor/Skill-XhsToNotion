# 小红书转 Notion - Python CLI 与 Skill

`program` 是本项目的主开发区，负责把小红书笔记提取并保存到 Notion 内容总库。Edge 扩展批量抓取实现已移至 `../references/4.edge_with_notion`，仅作为参考路线。

## 当前能力

- 从小红书链接自动提取标题、正文简介、作者、话题标签、封面图和最终跳转链接。
- 写入 Notion 数据库，并设置标题、链接、简介、作者、状态、野生标签、彩色标签和专辑 Relation。
- 使用 DeepSeek LLM 根据标题、简介、标签和用户维护的专辑描述推理最相关的前五个专辑候选，默认保存到第一个候选；DeepSeek 不可用时自动退回关键词兜底。
- 保存前按笔记 ID 查重，重复笔记会跳过创建并更新 `last_page_id.txt`。
- 支持对最近一次保存的页面追加野生标签。
- 支持对最近一次保存的页面更新归属专辑。
- 支持从 Notion 关联专辑库刷新 `album_map.json`。
- 支持启动本地收藏管理台，在浏览器或 Notion embed 中搜索、过滤、滚动加载、多选、批量追加到新专辑，并将笔记移入 Notion 回收站。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `SKILL.md` | Codex/OpenClaw skill 入口说明 |
| `xiaohongshu_to_notion_cli.py` | CLI 主入口，负责参数解析、提取、查重、保存和后续更新 |
| `local_extractor.py` | 小红书页面提取器，解析 `window.__INITIAL_STATE__` 和页面兜底信息 |
| `configure.py` | 写入本地 Notion API Key 和数据库 ID |
| `config.py` | 配置加载辅助类 |
| `config_template.json` | 本地配置模板 |
| `album_map.json` | 专辑名到 Notion relation page id 的映射 |
| `album_descriptions.json` | 专辑名到语义描述的映射，供 DeepSeek 推理参考 |
| `update_album_map.py` | 从 Notion 数据库刷新专辑映射 |
| `notion_manager.py` | 收藏管理台后端核心，负责查询、过滤、追加专辑 Relation 和移入回收站 |
| `manage_server.py` | 本地 Web 收藏管理台服务入口 |
| `start_management_console.ps1` | 一键启动本地管理台，可选启动 Cloudflare HTTPS 临时隧道 |
| `install_console_protocol.ps1` | 注册 `xhs-notion-console://` 本机启动协议 |
| `web/` | 收藏管理台前端页面、样式和交互脚本 |
| `last_page_id.txt` | 最近一次保存或命中的 Notion 页面 ID |

## Notion 数据库要求

Python CLI 当前面向内容总库，字段名需要与脚本保持一致：

| 属性名 | 类型 | 说明 |
| --- | --- | --- |
| `标题` | Title | 笔记标题 |
| `小红书链接` | URL | 原始或最终小红书链接，用于查重 |
| `简介` | Rich text | 笔记正文/描述 |
| `作者` | Rich text | 作者昵称 |
| `状态` | Select | 默认写入 `待阅读` |
| `野生标签` | Rich text | 从小红书提取或手动追加的标签 |
| `彩色标签` | Multi-select | 从野生标签拆分出的彩色标签，用于 Notion 画廊卡片展示 |
| `库B：专辑标签库` | Relation | 关联到专辑标签库 |

## 配置

推荐复制模板后填写本地配置：

```powershell
Copy-Item program/config_template.json program/config.json
python program/configure.py --api-key "ntn_xxx" --db-url "https://www.notion.so/..."
```

也可以使用环境变量作为兜底：

```powershell
$env:NOTION_API_KEY="ntn_xxx"
$env:NOTION_DATABASE_ID="your_database_id"
$env:DEEPSEEK_API_KEY="sk_xxx"
```

`program/config.json` 包含私密凭据，不应提交到 Git。

可选配置默认值：

```text
NOTION_TIMEOUT=15
NOTION_VERIFY_SSL=false
NOTION_FILE_UPLOAD_VERSION=2026-03-11
COVER_CACHE_ENABLED=true
COVER_UPLOAD_TO_NOTION=true
COVER_CACHE_DIR=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

## 封面缓存与上传接口

`cover_assets.py` 提供可复用的封面存储和 Notion 上传接口：

- `CoverAssetStore`：下载封面、按 SHA-256 去重、维护 `program/data/cover_assets.json` 索引，并提供 `/covers/{filename}` 本地 URL。
- `NotionFileUploader`：封装 Notion File Upload 的创建、发送文件、设置页面封面流程。
- `CoverAssetService`：组合“缓存 -> 上传 -> 设置页面封面”，CLI 和管理台共用。

默认保存笔记时会把封面上传为 Notion 托管文件；如需只使用外链封面，可设置 `COVER_UPLOAD_TO_NOTION=false`。本地运行管理台后，浏览器扩展可调用：

```http
POST http://127.0.0.1:8765/api/covers/cache
Content-Type: application/json

{
  "source_url": "https://...",
  "page_id": "notion-page-id",
  "upload_to_notion": true
}
```

返回的 `asset` 包含本地文件、哈希、源 URL、关联页面和 Notion `file_upload` id，适合扩展端复用。

## 常用命令

保存一个小红书笔记：

```powershell
python program/xiaohongshu_to_notion_cli.py --url "https://www.xiaohongshu.com/explore/..."
```

带手动字段保存：

```powershell
python program/xiaohongshu_to_notion_cli.py `
  --url "https://www.xiaohongshu.com/explore/..." `
  --title "笔记标题" `
  --summary "笔记简介" `
  --author "作者昵称" `
  --tags "标签1,标签2"
```

不要在普通保存时传 `--album`，这样 CLI 才会自动调用 DeepSeek 生成候选并保存到第 1 个候选。只有用户明确指定专辑时才传 `--album`。

为最近一次保存的页面追加标签：

```powershell
python program/xiaohongshu_to_notion_cli.py --append-tags "新标签,待整理"
```

为最近一次保存的页面更新专辑：

```powershell
python program/xiaohongshu_to_notion_cli.py --update-album "学习AI编程"
```

按最近一次候选列表的数字改选专辑：

```powershell
python program/xiaohongshu_to_notion_cli.py --select-album-candidate 2
```

为专辑写入或更新 LLM 参考描述：

```powershell
python program/xiaohongshu_to_notion_cli.py `
  --describe-album "积累拍照灵感" `
  --album-description "用于收集拍摄主题、画面构思、姿势、场景、风格参考和可复刻的出片灵感。"
```

刷新专辑映射：

```powershell
python program/update_album_map.py
```

启动收藏管理台：

```powershell
python program/manage_server.py
```

默认访问地址：

```text
http://127.0.0.1:8765
```

管理台支持：

- 搜索标题、简介、作者和野生标签。
- 按标题、作者、标签、状态、当前专辑过滤。
- 下滑自动加载更多结果。
- 多选当前结果。
- 选择目标专辑并批量追加。
- 右键卡片封面，将笔记移入 Notion 回收站。

批量追加使用“保留原专辑 + 追加目标专辑”的 Relation 更新方式，不会覆盖已有专辑。

如果要在 Notion 里使用，可新建 `小红书收藏管理台` 页面并用 `/embed` 嵌入本地地址。若 Notion 客户端无法访问 `127.0.0.1`，先在浏览器中直接打开。

### Notion 启动页

`web/notion_launcher.html` 是一个可上传或嵌入 Notion 的启动页。首次使用前运行：

```powershell
powershell -ExecutionPolicy Bypass -File program/install_console_protocol.ps1
```

之后可在启动页中点击：

- `启动小红书收藏管理`：调用 `xhs-notion-console://start?mode=local`，启动本地服务并打开 `http://127.0.0.1:8765`。

如需 Notion 内嵌完整管理台，可手动运行 `start_management_console.ps1 -Mode cloudflared-quick`。这需要先安装 `cloudflared`，脚本会尝试复制 `https://*.trycloudflare.com` 到剪贴板，供 Notion `/embed` 使用。

Quick Tunnel 地址是临时地址；固定 Notion 嵌入入口需要 Cloudflare Named Tunnel、自有域名或云端部署，并增加认证。

已知限制：Notion 上传的 HTML 运行在沙箱 iframe 中，可能会拦截 `xhs-notion-console://` 外部协议和弹窗。如果按钮无反应，优先确认本地服务 `http://127.0.0.1:8765/api/health`，再使用浏览器书签或桌面快捷方式作为稳定入口。

## 注意事项

- 小红书页面结构可能变化，提取失败时优先检查 `local_extractor.py`。
- 当前代码中为了处理本地网络/证书问题，Notion 请求存在 `verify=False` 的开发期写法；如需长期稳定使用，后续应改为正常证书校验或明确代理配置。
- `references/4.edge_with_notion` 使用另一套 Notion 字段名，与 Python CLI 并不完全兼容，修改前先对齐目标数据库 schema。
- 收藏管理台默认只监听 `127.0.0.1`，不要在公网环境暴露未加认证的服务。
