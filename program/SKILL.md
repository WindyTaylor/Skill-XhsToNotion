---
name: 小红书转Notion
description: 提取小红书笔记的标题、链接、作者、标签、简介和封面，并保存到 Notion 内容总库。当用户提供小红书链接或要求保存小红书笔记时调用。
homepage: https://www.xiaohongshu.com
metadata: {"clawdbot":{"emoji":"📱→📝","requires":{"env":["NOTION_API_KEY","NOTION_DATABASE_ID"]},"primaryEnv":"NOTION_API_KEY"}}
---

# 小红书转 Notion

这是本项目的主 skill，实际执行入口位于同目录下的 `xiaohongshu_to_notion_cli.py`。

## 适用场景

- 用户提供小红书链接，并要求保存到 Notion。
- 用户要求给最近保存的小红书笔记追加野生标签。
- 用户要求把最近保存的小红书笔记更新到指定专辑。
- 用户要求描述、补充、修改某个专辑的用途或收录范围，供后续 LLM 专辑推理参考。
- 用户要求刷新 Notion 专辑映射。
- 用户要求打开或启动小红书收藏管理台，用于搜索、过滤、滚动加载、多选笔记、批量整理、维护 AI 专辑语义说明、摄影拆图素材沉淀，或将笔记移入 Notion 回收站。

## 工作流程

1. 从用户消息中提取小红书 URL。若消息是 QQ/OpenClaw 卡片，必须使用完整 `jump_url`，不要删掉 `xsec_token`、`share_id`、`share_channel` 等 query 参数。
2. 调用 Python CLI 自动抓取页面内容。
3. CLI 会优先调用 DeepSeek LLM，根据标题、简介、标签以及 `album_descriptions.json` 中的专辑描述，从 `album_map.json` 中推理最相关的前五个专辑候选；DeepSeek 不可用时自动退回关键词兜底。
4. 未显式指定 `--album` 时，CLI 会自动保存到第 1 个最相关专辑。
5. 保存前按笔记 ID 查询 Notion，避免重复创建。
6. 将标题、链接、简介、作者、标签、状态、封面和专辑关系写入 Notion。
7. 把保存或命中的页面 ID 写入 `last_page_id.txt`，把最近一次专辑候选写入 `last_album_candidates.json`，供追加标签、更新专辑和数字改选使用。

## 执行命令

保存笔记：

```powershell
python xiaohongshu_to_notion_cli.py --url "https://www.xiaohongshu.com/explore/..."
```

保存并指定字段：

```powershell
python xiaohongshu_to_notion_cli.py `
  --url "https://www.xiaohongshu.com/explore/...?xsec_token=..." `
  --title "标题" `
  --summary "简介" `
  --author "作者" `
  --tags "标签1,标签2"
```

保存笔记时不要主动传 `--album`。只有用户明确指定“保存到某个专辑”时，才允许传 `--album "<用户指定专辑名>"`。未指定时必须让 CLI 自动调用 DeepSeek 生成 TOP5 候选并保存到第 1 个候选。

## QQ 卡片链接规则

- OpenClaw 收到小红书 QQ 卡片时，`jump_url` 才是要传给 CLI 的 URL。
- 不要把 `jump_url` 清洗成裸链接；保留全部 query 参数，尤其是 `xsec_token`、`xsec_source`、`share_id`、`share_channel`、`xhsshare`。
- 不要因为 URL 很长就截断；PowerShell 命令里用双引号包住完整 URL。
- `title`、`desc`、`tag` 是 QQ 卡片预览字段，可能被省略号截断。它们只能在页面抓取失败时作为部分兜底信息，不代表完整页面内容。
- 如果页面抓取失败但卡片字段可见，可以再次用完整 `jump_url` 加可见字段保存部分信息：

```powershell
python xiaohongshu_to_notion_cli.py `
  --url "<完整 jump_url>" `
  --title "<QQ 卡片 title>" `
  --summary "<QQ 卡片 desc>" `
  --tags "<QQ 卡片可见标签>"
```

## 回复要求

- 如果 CLI 输出里出现 `OPENCLAW_REPLY_START` 和 `OPENCLAW_REPLY_END`，最终回复必须只复制这两个标记之间的内容；不要改写、不要省略、不要添加任何额外句子。
- 保存成功后，回复用户时必须包含保存到 Notion 的专辑名称。
- 如果 CLI 输出里出现 `专辑候选 TOP5:` 或 `候选专辑：`，回复用户时必须列出 1-5 的全部候选，并说明当前已自动保存到第 1 个候选。
- 回复候选时保留数字序号，告诉用户可以直接回复数字来改到对应专辑。
- 禁止在保存回复里添加主观评论、玩笑、夸赞、感想、延伸解读或颜文字；只返回保存结果和候选专辑。
- 如果没有写入专辑或找不到专辑映射，需要明确告诉用户“专辑未设置”，不要假装已经分类。

追加最近页面的野生标签：

```powershell
python xiaohongshu_to_notion_cli.py --append-tags "标签1,标签2"
```

更新最近页面的归属专辑：

```powershell
python xiaohongshu_to_notion_cli.py --update-album "学习AI编程"
```

按最近一次候选列表的数字改选专辑：

```powershell
python xiaohongshu_to_notion_cli.py --select-album-candidate 2
```

当用户在保存后回复 `1`、`2`、`3`、`4` 或 `5`，并且语境明显是在选择刚才列出的专辑候选时，调用 `--select-album-candidate <数字>`，不要重新保存小红书笔记。

为专辑写入或更新 LLM 参考描述：

```powershell
python xiaohongshu_to_notion_cli.py --describe-album "积累拍照灵感" --album-description "用于收集拍摄主题、画面构思、姿势、场景、风格参考和可复刻的出片灵感。"
```

当用户在聊天框里说“把某某专辑描述为……”“某某专辑主要用于……”“以后某某专辑收录……”时，调用 `--describe-album` 和 `--album-description`。不要把这类请求当作保存小红书笔记。

刷新专辑映射：

```powershell
python update_album_map.py
```

启动本地收藏管理台：

```powershell
python manage_server.py
```

默认地址：

```text
http://127.0.0.1:8765
```

收藏管理台用于在浏览器或 Notion embed 中搜索内容总库，按标题、作者、野生标签、状态和专辑过滤；综合搜索、标题、作者、标签使用 Token Field，输入 `+` 或全角 `＋` 生成多个必须同时满足的关键词。下滑加载更多结果，多选笔记后执行批量整理，可在真实 Notion 专辑库中创建专辑并指定六大「主领域」，也可按专辑页面 ID 重命名，且必须迁移本地 `album_map.json`、`album_domains.json` 和 `album_descriptions.json` 中的名称键。左侧可收起工作区用于分别维护“收录什么”“排除什么”“与相近专辑的区别”；三部分组合写入 `album_descriptions.json`，专辑下拉列表和左侧列表的人工拖拽排序先写入浏览器本地缓存，再同步写入 `album_order.json` 并同步影响过滤器、批量目标专辑和 AI 专辑说明列表。卡片中的“拆图”用于查看笔记全部图片，手动选择图片并填写构图标签、动作标签、场景、景别、机位角度、主体类型、光线标签、色彩标签、情绪氛围、学习点、复刻提示、状态、评分和是否适合复刻，保存到 `NOTION_MATERIAL_DATABASE_ID` 指向的摄影素材库；该流程不做 AI 分析。通过右键卡片封面可将笔记移入 Notion 回收站。`update_album_map.py` 应同时刷新 `album_map.json` 与 `album_domains.json`。追加专辑必须保留原有 Relation，不要改成覆盖式移动。

如果用户希望从 Notion 快速打开管理台，运行 `install_console_protocol.ps1`：它会注册 `xhs-notion-console://` 本机协议、立即启动服务，并为当前 Windows 用户设置登录后后台自动启动。Notion 收藏中心的主按钮应优先直接链接 `http://127.0.0.1:8765`，避免沙箱拦截自定义协议；`web/notion_launcher.html`、本机协议、浏览器书签或桌面快捷方式只作为手动兜底。若用户希望 Notion 内嵌完整管理台，可让 `start_management_console.ps1` 以 `cloudflared-quick` 模式启动 Cloudflare Quick Tunnel；该地址是临时地址，固定入口需要后续配置 Named Tunnel 或云端部署。

## 配置

优先使用 `program/config.json`，也支持环境变量兜底。

```powershell
python program/configure.py --api-key "ntn_xxx" --db-url "https://www.notion.so/..."
```

必需配置：

- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`

可选配置：

- `NOTION_MATERIAL_DATABASE_ID`：摄影拆图素材库 database id。仅使用管理台“拆图”保存素材时需要。
- `NOTION_MATERIAL_DATA_SOURCE_ID`：摄影素材库 data source id。留空时后端会自动从 database 解析。
- `XHS_FETCH_MIN_INTERVAL_SECONDS`：拆图回源请求小红书原文页面的最小间隔，默认 `3`。
- `XHS_IMAGE_DOWNLOAD_INTERVAL_SECONDS`：拆图下载小红书图片的最小间隔，默认 `1`。
- `DEEPSEEK_API_KEY`：用于 LLM 专辑推理。未配置或调用失败时，CLI 会自动退回关键词兜底。
- `DEEPSEEK_BASE_URL`：默认 `https://api.deepseek.com`
- `DEEPSEEK_MODEL`：默认 `deepseek-chat`

`program/config.json` 是本地私密配置，不应提交。仓库只保留 `program/config_template.json`。

## Notion 字段约定

目标数据库应包含以下属性：

- `标题`：Title
- `小红书链接`：URL
- `简介`：Rich text
- `作者`：Rich text
- `状态`：Select，默认写入 `待阅读`
- `野生标签`：Rich text
- `彩色标签`：Multi-select，用于 Notion 画廊卡片展示；保存时从野生标签拆分写入
- `库B：专辑标签库`：Relation

## 维护提示

- 页面提取逻辑集中在 `local_extractor.py`。
- Notion 保存、查重、DeepSeek 专辑推理、追加标签、更新专辑和专辑描述维护集中在 `xiaohongshu_to_notion_cli.py`。
- 封面缓存与 Notion File Upload 集中在 `cover_assets.py`；CLI 和管理台共用该模块，运行时数据默认在 `program/data/`，不要提交。
- 收藏管理台后端集中在 `notion_manager.py` 和 `manage_server.py`，前端集中在 `web/`，包含查询过滤、滚动加载、批量整理、专辑语义说明维护和移入回收站能力。
- 专辑映射来自 `album_map.json`，可用 `update_album_map.py` 重新生成。
- 专辑语义描述来自 `album_descriptions.json`，由 `--describe-album` / `--album-description` 更新，供 DeepSeek 推理参考。
- Edge 扩展实现已放入 `references/4.edge_with_notion`，作为批量抓取参考，不是当前主开发路线。
