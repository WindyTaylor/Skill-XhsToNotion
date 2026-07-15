# 小红书转 Notion Skill

一个用于把小红书笔记沉淀到 Notion 内容总库的 Python CLI 与 Codex/OpenClaw skill。用户提供小红书链接后，脚本会抓取笔记标题、简介、作者、标签、封面和最终跳转链接，保存到 Notion 数据库，并根据专辑映射自动写入归属专辑。

当前主路线是 `program` 目录下的 Python CLI。`references/4.edge_with_notion` 中保留了 Edge 扩展批量抓取方案，仅作为历史和参考实现。

## 功能特性

- 从小红书链接自动提取标题、正文简介、作者、话题标签、封面图和最终跳转链接。
- 保存到 Notion 内容总库，写入标题、链接、简介、作者、状态、野生标签、彩色标签、封面和专辑 Relation。
- 保存前按小红书笔记 ID 查重，避免重复创建同一篇笔记。
- 使用 DeepSeek 的 OpenAI-compatible 接口，根据标题、简介、标签和专辑描述推理最相关的专辑候选。
- 未配置 DeepSeek 或调用失败时，自动退回本地关键词规则兜底分类。
- 支持保存后追加野生标签、更新归属专辑、按最近一次候选序号改选专辑。
- 支持从 Notion 专辑库刷新 `album_map.json`。
- 提供本地嵌入式收藏管理台，可搜索、过滤、滚动加载、多选笔记、批量追加到新专辑，并将笔记移入 Notion 回收站。
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
│   ├── start_management_console.ps1   # 一键启动本地管理台，可选启动 HTTPS 临时隧道
│   ├── install_console_protocol.ps1   # 注册 xhs-notion-console:// 本机启动协议
│   ├── configure.py                  # 写入本地配置
│   ├── config_template.json          # 配置模板
│   ├── album_map.json                # 专辑名到 Notion page id 的映射
│   ├── album_descriptions.json       # 专辑语义描述，供 LLM 分类参考
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
- 可选：DeepSeek API Key，用于更稳定的智能专辑分类。

安装依赖：

```powershell
python -m pip install requests
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

Relation 字段依赖 `program/album_map.json`。如果专辑库有增删改，运行 `program/update_album_map.py` 刷新映射。

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
| `NOTION_VERSION` | 否 | Notion API 版本，模板默认 `2025-09-03` |
| `NOTION_TIMEOUT` | 否 | Notion API 请求超时秒数，模板默认 `15` |
| `NOTION_VERIFY_SSL` | 否 | 是否校验 SSL 证书，模板默认 `false` 以兼容本地网络问题 |
| `DEEPSEEK_API_KEY` | 否 | 用于 LLM 专辑推理 |
| `DEEPSEEK_BASE_URL` | 否 | 默认 `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | 否 | 默认 `deepseek-chat` |

`program/config.json` 是本地私密配置，不应提交到 Git。仓库中只保留 `program/config_template.json`。

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

普通保存时建议不要传 `--album`，让 CLI 自动调用 DeepSeek 生成专辑候选并保存到第 1 个候选。只有明确要保存到某个专辑时，再传入：

```powershell
python program/xiaohongshu_to_notion_cli.py `
  --url "https://www.xiaohongshu.com/explore/..." `
  --album "学习AI编程"
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

管理台支持搜索标题、简介、作者、野生标签，按状态和专辑过滤，下滑自动加载更多结果，多选结果后追加到目标专辑。追加专辑会保留原有专辑 Relation，不会覆盖原分类；右键卡片封面可将笔记移入 Notion 回收站。

如需放入 Notion 页面，可在 Notion 中创建页面后使用 `/embed` 嵌入上述地址。若 Notion 客户端无法嵌入本地地址，先直接用浏览器打开管理台。

### Notion 快速入口与 HTTPS 嵌入

如果 Notion 无法直接嵌入 `http://127.0.0.1:8765`，可以使用“启动页 + 本机协议”的组合，在 Notion 中只保留一个启动按钮：

1. 首次在本机注册启动协议：

```powershell
powershell -ExecutionPolicy Bypass -File program/install_console_protocol.ps1
```

2. 将 `program/web/notion_launcher.html` 上传或嵌入到 Notion。这个 HTML 不包含 Notion token，只提供一个轻量管理台入口。
3. 在 Notion 启动页点击“启动小红书收藏管理”，会通过 `xhs-notion-console://start?mode=local` 启动本地服务，并自动打开 `http://127.0.0.1:8765`。
4. 如果需要在 Notion 内嵌完整管理台，可手动使用脚本的 Cloudflare Quick Tunnel 模式：

```powershell
winget install --id Cloudflare.cloudflared
```

```powershell
powershell -ExecutionPolicy Bypass -File program/start_management_console.ps1 -Mode cloudflared-quick
```

脚本会启动 `cloudflared tunnel --url http://127.0.0.1:8765`，并尝试把生成的 `https://*.trycloudflare.com` 地址复制到剪贴板。把该地址粘贴到 Notion 的 `/embed` 即可。

注意：Cloudflare Quick Tunnel 地址是临时的，重启后可能变化。长期固定入口建议配置 Cloudflare Named Tunnel 或云端部署，并增加访问认证。

已知限制：Notion 上传的 HTML 会运行在沙箱 iframe 中，部分 Notion 客户端或浏览器可能会拦截 `xhs-notion-console://` 外部协议和弹窗。如果按钮没有反应，本地协议和服务仍可正常使用，可靠兜底是直接打开 `http://127.0.0.1:8765`，或把 `xhs-notion-console://start?mode=local` 做成浏览器书签/桌面快捷方式。

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
- `program/last_album_candidates.json`：记录最近一次自动分类生成的专辑候选，供数字改选专辑使用。
- `program/album_map.json`：专辑名到 Notion Relation page id 的映射。
- `program/album_descriptions.json`：专辑语义描述，用于提升 DeepSeek 专辑推理准确度。
- `program/manage_server.py`：本地收藏管理台入口，默认只监听 `127.0.0.1`。
- `program/start_management_console.ps1`：一键启动本地管理台，可选启动 Cloudflare HTTPS 临时隧道。
- `program/install_console_protocol.ps1`：注册 `xhs-notion-console://` 协议，供 Notion 启动页唤起本地脚本。
- `program/notion_manager.py`：收藏管理台后端逻辑，负责查询、过滤、批量追加专辑和移入回收站。

## 维护说明

- 小红书页面提取逻辑集中在 `program/local_extractor.py`。
- Notion 保存、查重、DeepSeek 分类、追加标签、更新专辑集中在 `program/xiaohongshu_to_notion_cli.py`。
- Notion 字段发生变化时，需要同步更新 `program/README.md`、`program/SKILL.md` 和本 README。
- `references/4.edge_with_notion` 使用另一套 Notion 字段名，与当前 Python CLI 不完全兼容，合并两条路线前需要先统一 schema。
- 当前代码中为了处理本地网络或证书问题，Notion 请求存在 `verify=False` 的开发期写法；长期使用时建议改为正常证书校验或明确代理配置。
- 收藏管理台不会把 Notion token 写入前端页面；token 只从本地配置或环境变量进入后端进程。

## 相关文档

- [program/README.md](program/README.md)：Python CLI 与 skill 详细说明。
- [program/SKILL.md](program/SKILL.md)：Codex/OpenClaw skill 调用规则。
- [doc/PROJECT_SUMMARY.md](doc/PROJECT_SUMMARY.md)：项目路线和当前状态总结。
- [doc/PROJECT_WORKSPACE_GUIDE.md](doc/PROJECT_WORKSPACE_GUIDE.md)：目录用途和后续协作规则。
- [doc/NOTE_MANAGEMENT_CONSOLE_GUIDE.md](doc/NOTE_MANAGEMENT_CONSOLE_GUIDE.md)：Notion 嵌入式搜索管理台实现指引。
