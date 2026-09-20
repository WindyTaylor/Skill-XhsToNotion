# 小红书转 Notion Skill

一个用于把小红书笔记沉淀到 Notion 内容总库的 Python CLI 与 Codex/OpenClaw skill。用户提供小红书链接后，脚本会抓取笔记标题、简介、作者、标签、封面和最终跳转链接，保存到 Notion 数据库；作为 skill 调用时，由当前 AI agent 根据专辑说明选择目标专辑并显式传入。

当前主路线是 `program` 目录下的 Python CLI。`references/4.edge_with_notion` 中保留了 Edge 扩展批量抓取方案，仅作为历史和参考实现。

## 功能特性

- 从小红书链接自动提取标题、正文简介、作者、话题标签、封面图和最终跳转链接。
- 保存到 Notion 内容总库，写入标题、链接、简介、作者、状态、野生标签、彩色标签、封面和专辑 Relation。
- 保存前按小红书笔记 ID 查重，避免重复创建同一篇笔记。
- 作为 Codex/OpenClaw skill 使用时，由当前 AI agent 根据 `album_map.json` 和 `album_descriptions.json` 判断专辑，并通过 `--album` 显式写入。
- 直接命令行使用时，可显式开启 `--auto-classify deepseek` 或 `--auto-classify keywords` 作为备用自动分类模式。
- 支持保存后追加野生标签、更新归属专辑、按最近一次候选序号改选专辑。
- 支持从 Notion 专辑库刷新 `album_map.json`。
- 提供本地嵌入式收藏管理台，可搜索、过滤、滚动加载、多选笔记、批量整理、维护 AI 专辑语义说明，并将笔记移入 Notion 回收站。
- 可作为 Codex/OpenClaw skill 使用，适合接收 QQ 小红书卡片中的完整 `jump_url`。

## 目录结构

```text
.
├── program/                         # 当前主开发区：Python CLI、skill、配置和专辑映射
│   ├── xiaohongshu_to_notion_cli.py  # 主入口：提取、查重、保存、追加标签、更新专辑
│   ├── local_extractor.py            # 小红书页面提取器
│   ├── update_album_map.py           # 从 Notion 刷新专辑 Relation 映射
│   ├── notion_manager.py             # 收藏管理台的 Notion 查询、批量更新与回收站逻辑
│   ├── manage_server.py              # 本地 Web 收藏管理台服务
│   ├── start_management_console.ps1   # 一键启动本地管理台
│   ├── install_console_protocol.ps1   # 注册 xhs-notion-console:// 本机启动协议
│   ├── configure.py                  # 写入本地配置
│   ├── config_template.json          # 配置模板
│   ├── album_map.example.json        # 专辑名到 Notion page id 的映射模板
│   ├── album_domains.example.json    # 专辑名到 Notion 主领域的映射模板
│   ├── album_descriptions.example.json # 专辑语义描述模板
│   ├── SKILL.md                      # Codex/OpenClaw skill 说明
│   ├── web/                          # 嵌入式收藏管理台前端
│   └── README.md                     # program 目录详细说明
├── references/                       # Edge 扩展和历史触发脚本参考
├── doc/                              # 配置、状态、项目说明等文档
└── agent.md                          # 项目协作说明
```

## 环境要求

- Python 3.10 或更高版本。
- Python 依赖：`requests`。
- 一个 Notion integration token。
- 一个 Notion 内容总库 database id。
- 可选：DeepSeek API Key，仅在直接运行 CLI 并使用 `--auto-classify deepseek` 时用于自动专辑分类。

安装依赖：

```powershell
python -m pip install -r requirements.txt
```

开发和测试依赖：

```powershell
python -m pip install -r requirements-dev.txt
```

## Quick Start

```powershell
git clone <repo-url>
cd 20260705-xhs-to-notion
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item program/config_template.json program/config.json
python program/configure.py --api-key "ntn_xxx" --db-url "https://www.notion.so/..."
python program/update_album_map.py
python program/xiaohongshu_to_notion_cli.py --url "https://www.xiaohongshu.com/explore/..." --album "未分类收件箱"
```

也可以把下面这句话交给你的本地 AI 编程工具：

```text
clone 这个 skill：<repo-url>，并根据 doc/AI_INIT.md 完成初始化。
```

## Notion 数据库字段

目标 Notion 内容总库需要包含以下属性，字段名需要与脚本保持一致：

| 属性名 | 类型 | 说明 |
| --- | --- | --- |
| `标题` | Title | 小红书笔记标题 |
| `小红书链接` | URL | 原始或最终小红书链接，用于查重 |
| `简介` | Rich text | 笔记正文或描述 |
| `作者` | Rich text | 作者昵称 |
| `状态` | Select | 默认写入 `待阅读` |
| `野生标签` | Rich text | 从小红书提取或手动追加的标签 |
| `彩色标签` | Multi-select | 从野生标签拆分出的彩色标签，用于 Notion 画廊卡片展示 |
| `库B：专辑标签库` | Relation | 关联到 Notion 专辑标签库 |

Relation 字段依赖本地生成的 `program/album_map.json`。如果专辑库有增删改，运行 `program/update_album_map.py` 刷新映射。仓库只提交 `program/album_map.example.json` 等模板；真实 Notion page id 不应提交。

## 配置

复制配置模板并写入本地凭据：

```powershell
Copy-Item program/config_template.json program/config.json
python program/configure.py --api-key "ntn_xxx" --db-url "https://www.notion.so/..."
```

也可以直接用环境变量：

```powershell
$env:NOTION_API_KEY="ntn_xxx"
$env:NOTION_DATABASE_ID="your_database_id"
$env:DEEPSEEK_API_KEY="sk_xxx"
```

可用配置项：

| 配置项 | 必需 | 说明 |
| --- | --- | --- |
| `NOTION_API_KEY` | 是 | Notion integration token |
| `NOTION_DATABASE_ID` | 是 | Notion 内容总库 database id |
| `NOTION_DATA_SOURCE_ID` | 否 | Notion 新版 data source id；留空时管理台会自动从 database 解析 |
| `NOTION_MATERIAL_DATABASE_ID` | 否 | 摄影拆图素材库 database id；仅使用“拆图”保存素材时需要 |
| `NOTION_MATERIAL_DATA_SOURCE_ID` | 否 | 摄影素材库新版 data source id；留空时后端会自动从 database 解析 |
| `NOTION_VERSION` | 否 | Notion API 版本，模板默认 `2025-09-03` |
| `NOTION_TIMEOUT` | 否 | Notion API 请求超时秒数，模板默认 `15` |
| `NOTION_VERIFY_SSL` | 否 | 是否校验 SSL 证书，模板默认 `false` 以兼容本地网络问题 |
| `DEEPSEEK_API_KEY` | 否 | 仅在使用 `--auto-classify deepseek` 时用于 CLI 自动专辑推理 |
| `DEEPSEEK_BASE_URL` | 否 | 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 否 | 默认 `deepseek-chat` |
| `NOTION_FILE_UPLOAD_VERSION` | 否 | Notion File Upload API 版本，默认 `2026-03-11` |
| `COVER_CACHE_ENABLED` | 否 | 是否启用封面本地缓存，默认 `true` |
| `COVER_UPLOAD_TO_NOTION` | 否 | 是否把缓存封面上传到 Notion 并设置为页面封面，默认 `true` |
| `COVER_CACHE_DIR` | 否 | 自定义封面缓存目录；留空时使用 `program/data/covers` |
| `XHS_FETCH_MIN_INTERVAL_SECONDS` | 否 | 拆图回源请求小红书原文页面的最小间隔，默认 `3` |
| `XHS_IMAGE_DOWNLOAD_INTERVAL_SECONDS` | 否 | 拆图下载小红书图片的最小间隔，默认 `1` |

`program/config.json` 是本地私密配置，不应提交到 Git。仓库中只保留 `program/config_template.json`。

`program/album_map.json`、`program/album_domains.json`、`program/album_order.json`、`program/album_descriptions.json`、`program/last_page_id.txt` 和 `program/last_album_candidates.json` 都是本地运行数据，不应提交到 Git。新用户可以参考对应的 `*.example.json`，也可以在配置 Notion 后运行 `program/update_album_map.py` 生成映射。

## 封面缓存与上传

CLI 保存笔记时会优先把小红书封面下载到本地缓存，再通过 Notion File Upload 上传为 Notion 托管文件并设置为页面封面，避免图库视图继续依赖不稳定的外链封面。缓存索引和图片默认保存在 `program/data/`，该目录已加入 `.gitignore`。

管理台后端保留了可复用接口，后续浏览器扩展可以调用本机服务完成缓存和上传，而不是直接持有 Notion token：

```http
POST http://127.0.0.1:8765/api/covers/cache
Content-Type: application/json

{
  "source_url": "https://...",
  "page_id": "notion-page-id",
  "upload_to_notion": true
}
```

成功响应会返回 `asset`，其中包含 `id`、`filename`、`local_url`、`content_type`、`size`、`sha256`、`notion_file_upload_id` 等字段。本地封面可通过管理台的 `/covers/{filename}` 静态路径访问。

## 摄影拆图素材库

管理台支持在每张笔记卡片上点击“拆图”，查看该小红书笔记中的全部图片。用户手动勾选图片后，可填写构图标签、动作标签、场景、景别、机位角度、主体类型、光线标签、色彩标签、情绪氛围、学习点、复刻提示、状态、评分和是否适合复刻，并保存到独立的 Notion 摄影素材库。该流程不做 AI 分析。

素材库通过 `NOTION_MATERIAL_DATABASE_ID` 配置。建议字段包括：`标题`、`图片`、`图片链接`、`来源笔记`、`原文链接`、`来源标题`、`作者`、`构图标签`、`动作标签`、`光线标签`、`色彩标签`、`场景`、`景别`、`机位角度`、`主体类型`、`情绪氛围`、`学习点`、`复刻提示`、`状态`、`来源图片序号`、`适合复刻`、`评分`。后端只写入素材库中实际存在且类型匹配的字段。

推荐在 Notion 里把素材库配置为 Gallery 视图，并建立 `按色彩找图`、`按动作找图`、`按构图找图` 和 `可复刻清单` 等常用视图。

拆图优先读取本地缓存；旧笔记首次拆图或手动“重新提取图片”时才会请求小红书原文页面。后端默认对小红书页面请求和图片下载做轻量限速，可通过 `XHS_FETCH_MIN_INTERVAL_SECONDS` 与 `XHS_IMAGE_DOWNLOAD_INTERVAL_SECONDS` 调整。

## 使用方法

保存一篇小红书笔记：

```powershell
python program/xiaohongshu_to_notion_cli.py --url "https://www.xiaohongshu.com/explore/..."
```

保存时手动补充字段：

```powershell
python program/xiaohongshu_to_notion_cli.py `
  --url "https://www.xiaohongshu.com/explore/..." `
  --title "笔记标题" `
  --summary "笔记简介" `
  --author "作者昵称" `
  --tags "标签1,标签2"
```

作为 skill 使用时，推荐由当前 AI agent 先判断目标专辑，再通过 `--album` 显式传入：

```powershell
python program/xiaohongshu_to_notion_cli.py `
  --url "https://www.xiaohongshu.com/explore/..." `
  --album "学习AI编程"
```

如果脱离 agent 直接运行 CLI，并且希望 CLI 自己生成候选，可显式开启备用自动分类：

```powershell
python program/xiaohongshu_to_notion_cli.py `
  --url "https://www.xiaohongshu.com/explore/..." `
  --auto-classify deepseek
```

为最近一次保存或命中的 Notion 页面追加标签：

```powershell
python program/xiaohongshu_to_notion_cli.py --append-tags "新标签,待整理"
```

更新最近一次保存或命中的 Notion 页面的归属专辑：

```powershell
python program/xiaohongshu_to_notion_cli.py --update-album "学习AI编程"
```

按最近一次专辑候选列表的序号改选专辑：

```powershell
python program/xiaohongshu_to_notion_cli.py --select-album-candidate 2
```

为专辑写入或更新 LLM 参考描述：

```powershell
python program/xiaohongshu_to_notion_cli.py `
  --describe-album "积累拍照灵感" `
  --album-description "用于收集拍摄主题、画面构思、姿势、场景、风格参考和可复刻的出片灵感。"
```

刷新 Notion 专辑映射：

```powershell
python program/update_album_map.py
```

启动本地收藏管理台：

```powershell
python program/manage_server.py
```

默认地址：

```text
http://127.0.0.1:8765
```

管理台支持搜索标题、简介、作者、野生标签，综合搜索、标题、作者和标签使用 Token Field 录入多个必须同时满足的关键词；也可上传本地图片作为背景，前端会自动缩放压缩后保存到当前浏览器。管理台还支持按状态和专辑过滤，下滑自动加载更多结果，多选结果后执行批量整理，在真实 Notion 专辑库中创建或重命名专辑，并在左侧可收起工作区中维护 `album_descriptions.json`。专辑说明按 Notion「主领域」的六大主题分类定位；追加专辑会保留原有专辑 Relation，不会覆盖原分类；右键卡片封面可将笔记移入 Notion 回收站。

如需放入 Notion 页面，可在 Notion 中创建页面后使用 `/embed` 嵌入上述地址。若 Notion 客户端无法嵌入本地地址，先直接用浏览器打开管理台。

### Notion 快速入口

如果 Notion 无法直接嵌入 `http://127.0.0.1:8765`，可以使用“启动页 + 本机协议”的组合，在 Notion 中只保留一个启动按钮：

1. 首次在本机安装管理台入口：

```powershell
powershell -ExecutionPolicy Bypass -File program/install_console_protocol.ps1
```

安装脚本会注册 `xhs-notion-console://`、立即启动管理台，并为当前 Windows 用户设置登录后后台自动启动。这样收藏中心中直接指向 `http://127.0.0.1:8765` 的“进入收藏管理台”按钮无需预先手动运行服务。

2. 将 `program/web/notion_launcher.html` 上传或嵌入到 Notion。这个 HTML 不包含 Notion token，只提供一个轻量管理台入口。
3. 在 Notion 启动页点击“启动小红书收藏管理”，会通过 `xhs-notion-console://start?mode=local` 启动本地服务，并自动打开 `http://127.0.0.1:8765`。若 Notion 客户端拦截自定义协议，直接使用收藏中心中指向本地地址的普通链接即可。

已知限制：Notion 上传的 HTML 会运行在沙箱 iframe 中，部分 Notion 客户端或浏览器可能会拦截 `xhs-notion-console://` 外部协议和弹窗。默认安装会让管理台随 Windows 登录后台启动，因此优先让 Notion 按钮直接打开 `http://127.0.0.1:8765`；自定义协议、浏览器书签或桌面快捷方式作为手动兜底。

## QQ 卡片与 Skill 使用注意

当 Codex/OpenClaw 从 QQ 收到小红书卡片时，应使用卡片中的完整 `jump_url`，不要删掉 query 参数。尤其需要保留：

- `xsec_token`
- `xsec_source`
- `share_id`
- `share_channel`
- `xhsshare`

QQ 卡片里的 `title`、`desc`、`tag` 可能被截断，只能作为页面抓取失败时的兜底信息。优先让 CLI 使用完整 URL 抓取页面内容。

## 输出和状态文件

- `program/last_page_id.txt`：记录最近一次保存或查重命中的 Notion 页面 ID，供追加标签和更新专辑使用。
- `program/last_album_candidates.json`：本地记录最近一次自动分类生成的专辑候选，供数字改选专辑使用，不提交。
- `program/album_map.json`：本地专辑名到 Notion Relation page id 的映射，不提交；仓库保留 `program/album_map.example.json`。
- `program/album_descriptions.json`：专辑语义描述，优先供当前 AI agent 判断专辑；显式使用 `--auto-classify deepseek` 时也会供 DeepSeek 推理参考。
- `program/manage_server.py`：本地收藏管理台入口，默认只监听 `127.0.0.1`。
- `program/start_management_console.ps1`：一键启动本地管理台。
- `program/install_console_protocol.ps1`：注册 `xhs-notion-console://` 协议并安装当前用户登录自启动，供 Notion 入口稳定打开本地管理台。
- `program/notion_manager.py`：收藏管理台后端逻辑，负责查询、过滤、批量追加专辑和移入回收站。
- `deploy/ubuntu/`：Ubuntu/systemd/Nginx 部署模板，适合把第一版 skill 放到服务器上做运行测试；使用前替换域名和环境变量。

## 维护说明

- 小红书页面提取逻辑集中在 `program/local_extractor.py`。
- Notion 保存、查重、显式专辑写入、可选 CLI 自动分类、追加标签、更新专辑集中在 `program/xiaohongshu_to_notion_cli.py`。
- Notion 字段发生变化时，需要同步更新 `program/README.md`、`program/SKILL.md` 和本 README。
- `references/4.edge_with_notion` 使用另一套 Notion 字段名，与当前 Python CLI 不完全兼容，合并两条路线前需要先统一 schema。
- 当前代码中为了处理本地网络或证书问题，Notion 请求存在 `verify=False` 的开发期写法；长期使用时建议改为正常证书校验或明确代理配置。
- 收藏管理台不会把 Notion token 写入前端页面；token 只从本地配置或环境变量进入后端进程。

## 相关文档

- [program/README.md](program/README.md)：Python CLI 与 skill 详细说明。
- [program/SKILL.md](program/SKILL.md)：Codex/OpenClaw skill 调用规则。
- [doc/PROJECT_SUMMARY.md](doc/PROJECT_SUMMARY.md)：项目路线和当前状态总结。
- [doc/PROJECT_WORKSPACE_GUIDE.md](doc/PROJECT_WORKSPACE_GUIDE.md)：目录用途和后续协作规则。
- [doc/AGENT_FAST_CONTEXT.md](doc/AGENT_FAST_CONTEXT.md)：给后续 AI agent 的快速项目上下文。
- [doc/AI_INIT.md](doc/AI_INIT.md)：给其他 AI 编程工具的初始化说明。
