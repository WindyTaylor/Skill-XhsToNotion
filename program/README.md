# 小红书转 Notion - Python CLI 与 Skill

`program` 是本项目的主开发区，负责把小红书笔记提取并保存到 Notion 内容总库。Edge 扩展批量抓取实现已移至 `../references/4.edge_with_notion`，仅作为参考路线。

## 当前能力

- 从小红书链接自动提取标题、正文简介、作者、话题标签、封面图和最终跳转链接。
- 写入 Notion 数据库，并设置标题、链接、简介、作者、状态、野生标签和专辑 Relation。
- 保存前按笔记 ID 查重，重复笔记会跳过创建并更新 `last_page_id.txt`。
- 支持对最近一次保存的页面追加野生标签。
- 支持对最近一次保存的页面更新归属专辑。
- 支持从 Notion 关联专辑库刷新 `album_map.json`。

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
| `update_album_map.py` | 从 Notion 数据库刷新专辑映射 |
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
```

`program/config.json` 包含私密凭据，不应提交到 Git。

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
  --tags "标签1,标签2" `
  --album "待分类收件箱"
```

为最近一次保存的页面追加标签：

```powershell
python program/xiaohongshu_to_notion_cli.py --append-tags "新标签,待整理"
```

为最近一次保存的页面更新专辑：

```powershell
python program/xiaohongshu_to_notion_cli.py --update-album "学习AI编程"
```

刷新专辑映射：

```powershell
python program/update_album_map.py
```

## 注意事项

- 小红书页面结构可能变化，提取失败时优先检查 `local_extractor.py`。
- 当前代码中为了处理本地网络/证书问题，Notion 请求存在 `verify=False` 的开发期写法；如需长期稳定使用，后续应改为正常证书校验或明确代理配置。
- `references/4.edge_with_notion` 使用另一套 Notion 字段名，与 Python CLI 并不完全兼容，修改前先对齐目标数据库 schema。
