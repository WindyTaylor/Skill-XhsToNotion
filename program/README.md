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
- 支持启动本地收藏管理台，在浏览器或 Notion embed 中搜索、过滤、滚动加载、多选、批量整理、维护 AI 专辑语义说明，并将笔记移入 Notion 回收站。

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
| `album_domains.json` | 专辑名到 Notion「主领域」的映射，供管理台分组定位 |
| `album_descriptions.json` | 专辑名到语义描述的映射，供 DeepSeek 推理参考 |
| `album_order.json` | 管理台专辑人工排序，保存 Notion 专辑 page id 顺序 |
| `update_album_map.py` | 从 Notion 数据库刷新专辑映射与主领域映射 |
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
NOTION_MATERIAL_DATABASE_ID=
NOTION_MATERIAL_DATA_SOURCE_ID=
NOTION_FILE_UPLOAD_VERSION=2026-03-11
COVER_CACHE_ENABLED=true
COVER_UPLOAD_TO_NOTION=true
COVER_CACHE_DIR=
XHS_FETCH_MIN_INTERVAL_SECONDS=3
XHS_IMAGE_DOWNLOAD_INTERVAL_SECONDS=1
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

## 摄影拆图素材库

管理台卡片中的“拆图”按钮会打开当前笔记的图片选择窗口。新收藏的图文笔记会在保存后缓存全部图片；旧笔记会在首次拆图时按原文链接重新提取图片。选择图片后，管理台会把手动填写的构图标签、动作标签、场景、景别、机位角度、主体类型、光线标签、色彩标签、情绪氛围、学习点、复刻提示、状态、评分和是否适合复刻写入独立的摄影素材库，不做 AI 分析。

为降低对小红书的密集请求风险，拆图会优先读取本地缓存；只有旧笔记首次拆图或手动点击“重新提取图片”时才请求原文页面。默认限速为：请求原文页面间隔至少 `3` 秒，下载小红书图片间隔至少 `1` 秒，可通过 `XHS_FETCH_MIN_INTERVAL_SECONDS` 和 `XHS_IMAGE_DOWNLOAD_INTERVAL_SECONDS` 调整。

使用前在 `program/config.json` 或环境变量中配置：

```text
NOTION_MATERIAL_DATABASE_ID=your_material_database_id
NOTION_MATERIAL_DATA_SOURCE_ID=
```

素材库建议包含以下字段；管理台只写入实际存在且类型匹配的字段：

| 字段 | 建议类型 | 用途 |
| --- | --- | --- |
| `标题` | Title | 素材标题 |
| `图片` | Files | 选中的图片 |
| `图片链接` | URL | 原始图片 URL |
| `来源笔记` | Relation | 关联内容总库中的原笔记 |
| `原文链接` | URL | 小红书原文 |
| `来源标题` | Rich text | 原笔记标题 |
| `作者` | Rich text | 原作者 |
| `构图标签` | Multi-select | 手动记录构图方式 |
| `动作标签` | Multi-select | 人物动作、姿势和可复刻动作 |
| `光线标签` | Multi-select | 手动记录光线特征 |
| `色彩标签` | Multi-select | 手动记录色彩特征 |
| `场景` | Select 或 Multi-select | 拍摄场景 |
| `景别` | Select | 特写、近景、中景、全身、远景、空镜 |
| `机位角度` | Multi-select | 低机位、俯拍、平视、侧面等 |
| `主体类型` | Multi-select | 人物、背影、手部、建筑、食物等 |
| `情绪氛围` | Multi-select | 松弛、清冷、电影感、生活感等 |
| `学习点` | Rich text | 画面拆解笔记 |
| `复刻提示` | Rich text | 后续拍摄可照做的动作 |
| `状态` | Select | `待分析`、`已拆解`、`已复刻`、`已内化` |
| `来源图片序号` | Number | 原笔记中的图片序号 |
| `适合复刻` | Checkbox | 是否适合后续照着拍 |
| `评分` | Number | 1-5 分的主观收藏价值 |

推荐在 Notion 里配置几个常用视图：

- `按色彩找图`：Gallery 视图，按 `色彩标签` 筛选或分组。
- `按动作找图`：Gallery 视图，按 `动作标签` 筛选，适合找姿势参考。
- `按构图找图`：Gallery 视图，按 `构图标签` 筛选，适合复盘构图方法。
- `可复刻清单`：筛选 `适合复刻` 为勾选，按 `评分` 降序。

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
- 可上传本地图片作为管理台背景；前端会自动缩放压缩后保存到当前浏览器，图片过大或浏览器存储受限时会给出页面提示。
- 顶部综合搜索、标题、作者和标签使用 Token Field：输入 `+` 或全角 `＋` 会生成独立关键词 token，回车/失焦会提交当前草稿；同一输入框内的关键词必须全部命中。
- 按标题、作者、标签、状态、当前专辑过滤。
- 下滑自动加载更多结果。
- 多选或全选当前结果。
- 批量重新运行 AI 分类。
- 批量追加、移动或移除专辑。
- 在“专辑管理”中直接创建 Notion 专辑并选择六大主领域，或重命名当前专辑；重命名保留已有笔记 Relation、主领域和 AI 语义说明。
- 批量修改状态。
- 批量重新缓存并上传失效封面。
- 批量清理空值、占位词与重复标签。
- 批量合并重复记录；有效字段会汇总到保留项，重复项移入 Notion 回收站。
- 批量整理区保留原生按钮和下拉框，支持 Tab 键导航与系统高亮色焦点环；禁用项不会获得焦点，过长内容会在不改变真实值的前提下省略显示。
- 结果卡片中的作者名使用独立身份胶囊展示，点击即可复制完整作者名；野生标签按文字稳定分配柔和彩色样式，不使用高饱和大红色，专辑标签仍保持统一紫色。
- 在左侧可收起的“AI 专辑语义说明”工作区中，按 Notion 六大「主领域」定位专辑，再分别填写“收录什么”“排除什么”“与相近专辑的区别”；保存时三部分会组合写入 `album_descriptions.json`，后续 DeepSeek 专辑推理会立即读取。旧版自由文本说明会自动载入“收录什么”。
- 专辑过滤器和批量目标专辑使用管理台自绘选择器，避免浏览器原生下拉菜单在嵌入页里出现白底弹层；专辑下拉列表和左侧专辑列表都支持拖拽排序，顺序保存到 `album_order.json`，并同步影响过滤器、批量目标专辑和 AI 专辑说明列表。
- 右键卡片封面，将笔记移入 Notion 回收站。

“追加”会保留原专辑，“移动”会用目标专辑替换已有 Relation，“移除”只删除指定专辑 Relation。
AI 重分类单次最多处理 20 篇，其余批量操作单次最多处理 100 篇。

如果要在 Notion 里使用，可新建 `小红书收藏管理台` 页面并用 `/embed` 嵌入本地地址。若 Notion 客户端无法访问 `127.0.0.1`，先在浏览器中直接打开。

### Notion 启动页

`web/notion_launcher.html` 是一个可上传或嵌入 Notion 的启动页。首次使用前运行：

```powershell
powershell -ExecutionPolicy Bypass -File program/install_console_protocol.ps1
```

安装脚本会注册本机协议、立即启动管理台，并写入当前 Windows 用户的登录自启动项。收藏中心里的普通按钮可以继续直接链接 `http://127.0.0.1:8765`；登录后服务会在后台可用，不需要每次手动启动。

之后可在启动页中点击：

- `启动小红书收藏管理`：调用 `xhs-notion-console://start?mode=local`，启动本地服务并打开 `http://127.0.0.1:8765`。

如需 Notion 内嵌完整管理台，可手动运行 `start_management_console.ps1 -Mode cloudflared-quick`。这需要先安装 `cloudflared`，脚本会尝试复制 `https://*.trycloudflare.com` 到剪贴板，供 Notion `/embed` 使用。

Quick Tunnel 地址是临时地址；固定 Notion 嵌入入口需要 Cloudflare Named Tunnel、自有域名或云端部署，并增加认证。

已知限制：Notion 上传的 HTML 运行在沙箱 iframe 中，可能会拦截 `xhs-notion-console://` 外部协议和弹窗。优先使用登录自启动服务配合普通的 `http://127.0.0.1:8765` 链接；如果按钮无反应，先确认 `http://127.0.0.1:8765/api/health`，再使用本机协议、浏览器书签或桌面快捷方式。

## 注意事项

- 小红书页面结构可能变化，提取失败时优先检查 `local_extractor.py`。
- 当前代码中为了处理本地网络/证书问题，Notion 请求存在 `verify=False` 的开发期写法；如需长期稳定使用，后续应改为正常证书校验或明确代理配置。
- `references/4.edge_with_notion` 使用另一套 Notion 字段名，与 Python CLI 并不完全兼容，修改前先对齐目标数据库 schema。
- 收藏管理台默认只监听 `127.0.0.1`，不要在公网环境暴露未加认证的服务。
