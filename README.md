# 小红书转 Notion Skill

一个用于把小红书笔记沉淀到 Notion 内容总库的 Python CLI 与 Codex/OpenClaw skill。用户提供小红书链接后，脚本会抓取笔记标题、简介、作者、标签、封面和最终跳转链接，保存到 Notion 数据库，并根据专辑映射自动写入归属专辑。

当前主路线是 `program` 目录下的 Python CLI。`references/4.edge_with_notion` 中保留了 Edge 扩展批量抓取方案，仅作为历史和参考实现。

## 功能特性

- 从小红书链接自动提取标题、正文简介、作者、话题标签、封面图和最终跳转链接。
- 保存到 Notion 内容总库，写入标题、链接、简介、作者、状态、野生标签、封面和专辑 Relation。
- 保存前按小红书笔记 ID 查重，避免重复创建同一篇笔记。
- 使用 DeepSeek 的 OpenAI-compatible 接口，根据标题、简介、标签和专辑描述推理最相关的专辑候选。
- 未配置 DeepSeek 或调用失败时，自动退回本地关键词规则兜底分类。
- 支持保存后追加野生标签、更新归属专辑、按最近一次候选序号改选专辑。
- 支持从 Notion 专辑库刷新 `album_map.json`。
- 可作为 Codex/OpenClaw skill 使用，适合接收 QQ 小红书卡片中的完整 `jump_url`。

## 目录结构

```text
.
├── program/                         # 当前主开发区：Python CLI、skill、配置和专辑映射
│   ├── xiaohongshu_to_notion_cli.py  # 主入口：提取、查重、保存、追加标签、更新专辑
│   ├── local_extractor.py            # 小红书页面提取器
│   ├── update_album_map.py           # 从 Notion 刷新专辑 Relation 映射
│   ├── configure.py                  # 写入本地配置
│   ├── config_template.json          # 配置模板
│   ├── album_map.json                # 专辑名到 Notion page id 的映射
│   ├── album_descriptions.json       # 专辑语义描述，供 LLM 分类参考
│   ├── SKILL.md                      # Codex/OpenClaw skill 说明
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
| `NOTION_VERSION` | 否 | Notion API 版本，模板默认 `2025-09-03` |
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

## 维护说明

- 小红书页面提取逻辑集中在 `program/local_extractor.py`。
- Notion 保存、查重、DeepSeek 分类、追加标签、更新专辑集中在 `program/xiaohongshu_to_notion_cli.py`。
- Notion 字段发生变化时，需要同步更新 `program/README.md`、`program/SKILL.md` 和本 README。
- `references/4.edge_with_notion` 使用另一套 Notion 字段名，与当前 Python CLI 不完全兼容，合并两条路线前需要先统一 schema。
- 当前代码中为了处理本地网络或证书问题，Notion 请求存在 `verify=False` 的开发期写法；长期使用时建议改为正常证书校验或明确代理配置。

## 相关文档

- [program/README.md](program/README.md)：Python CLI 与 skill 详细说明。
- [program/SKILL.md](program/SKILL.md)：Codex/OpenClaw skill 调用规则。
- [doc/PROJECT_SUMMARY.md](doc/PROJECT_SUMMARY.md)：项目路线和当前状态总结。
- [doc/PROJECT_WORKSPACE_GUIDE.md](doc/PROJECT_WORKSPACE_GUIDE.md)：目录用途和后续协作规则。
