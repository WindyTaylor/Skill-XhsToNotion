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
- 用户要求刷新 Notion 专辑映射。

## 工作流程

1. 从用户消息中提取小红书 URL。
2. 调用 Python CLI 自动抓取页面内容。
3. 保存前按笔记 ID 查询 Notion，避免重复创建。
4. 将标题、链接、简介、作者、标签、状态、封面和专辑关系写入 Notion。
5. 把保存或命中的页面 ID 写入 `last_page_id.txt`，供追加标签和更新专辑使用。

## 执行命令

保存笔记：

```powershell
python program/xiaohongshu_to_notion_cli.py --url "https://www.xiaohongshu.com/explore/..."
```

保存并指定字段：

```powershell
python program/xiaohongshu_to_notion_cli.py `
  --url "https://www.xiaohongshu.com/explore/..." `
  --title "标题" `
  --summary "简介" `
  --author "作者" `
  --tags "标签1,标签2" `
  --album "待分类收件箱"
```

追加最近页面的野生标签：

```powershell
python program/xiaohongshu_to_notion_cli.py --append-tags "标签1,标签2"
```

更新最近页面的归属专辑：

```powershell
python program/xiaohongshu_to_notion_cli.py --update-album "学习AI编程"
```

刷新专辑映射：

```powershell
python program/update_album_map.py
```

## 配置

优先使用 `program/config.json`，也支持环境变量兜底。

```powershell
python program/configure.py --api-key "ntn_xxx" --db-url "https://www.notion.so/..."
```

必需配置：

- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`

`program/config.json` 是本地私密配置，不应提交。仓库只保留 `program/config_template.json`。

## Notion 字段约定

目标数据库应包含以下属性：

- `标题`：Title
- `小红书链接`：URL
- `简介`：Rich text
- `作者`：Rich text
- `状态`：Select，默认写入 `待阅读`
- `野生标签`：Rich text
- `库B：专辑标签库`：Relation

## 维护提示

- 页面提取逻辑集中在 `local_extractor.py`。
- Notion 保存、查重、追加标签、更新专辑集中在 `xiaohongshu_to_notion_cli.py`。
- 专辑映射来自 `album_map.json`，可用 `update_album_map.py` 重新生成。
- Edge 扩展实现已放入 `references/4.edge_with_notion`，作为批量抓取参考，不是当前主开发路线。
