---
name: "xiaohongshu-to-notion"
description: "提取小红书笔记的标题、链接、作者、标签、简介和封面并保存到Notion数据库。当用户分享小红书链接或要求保存时调用。"
---

# 小红书转Notion (Xiaohongshu to Notion)

此技能通过 Python 实现，用于将小红书的笔记内容（包括标题、链接、作者、标签、简介和封面图片）自动提取并保存到指定的 Notion 数据库中。

## 适用场景 (When to invoke)

- 用户在对话中提供了一个小红书的链接（例如 `https://www.xiaohongshu.com/explore/...`）。
- 用户明确要求“保存这个小红书笔记到Notion”或“把这篇小红书存起来”。

## 工作原理与使用说明

1. **环境依赖**：运行 Python 脚本，需保证安装了 `requests` 等必要库。
2. **凭据安全**：不得使用硬编码凭证。脚本需通过环境变量 `NOTION_API_KEY` 和 `NOTION_DATABASE_ID` 获取验证信息。
3. **执行流程**：
   - 助手提取用户提供的小红书 URL。
   - 调用 `xiaohongshu_to_notion_cli.py` 脚本，仅需传入 URL。
   - 脚本内部将自动打开网页、抓取页面信息（标题、链接、作者、标签、简介、封面），并将其一键保存到 Notion 数据库。

### 执行命令示例

当用户发送一个小红书链接时，助手直接执行：

```bash
python xiaohongshu_to_notion_cli.py --url "https://www.xiaohongshu.com/explore/..."
```

*如果用户明确给出了特定的标题或简介，你可以作为可选参数追加（如 `--title "..."`），否则只需提供 `--url`，脚本会自动提取剩余内容。*

## 配置指南

- **NOTION_API_KEY**: Notion 集成的 Secret Token。
- **NOTION_DATABASE_ID**: 需要写入的 Notion 数据库 ID。
- 在运行环境（如 PowerShell 或 bash）中先通过 `export` 或 `set` 设置这些环境变量。
