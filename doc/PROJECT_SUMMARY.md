# 小红书转 Notion 项目总结

Updated: 2026-07-10

## 项目目标

本项目用于把小红书笔记沉淀到 Notion 内容总库。当前主开发路线是 Python CLI + skill：用户提供小红书链接后，脚本自动提取标题、简介、作者、标签、封面和最终链接，并保存到 Notion。

## 当前目录结构

| 目录 | 内容 |
| --- | --- |
| `program` | 主开发代码：Python CLI、页面提取器、Notion 配置工具、专辑映射、skill 文档 |
| `references` | 参考实现：Edge 扩展批量抓取路线、历史 OpenClaw trigger |
| `doc` | 项目说明、历史状态、配置指南、初始化工作区规则 |

## 主路线：Python CLI 与 Skill

主入口是 `program/xiaohongshu_to_notion_cli.py`。

核心流程：

1. 接收 `--url` 或手动字段参数。
2. 当标题/简介缺失时，调用 `program/local_extractor.py` 抓取小红书页面。
3. 从页面 `window.__INITIAL_STATE__` 中提取标题、作者、标签、正文和封面。
4. 解析笔记 ID，并用 Notion 数据库中的 `小红书链接` 字段查重。
5. 未重复时创建 Notion 页面，写入标题、链接、简介、作者、状态、野生标签、彩色标签、封面和专辑 Relation。
6. 将保存或命中的 Notion 页面 ID 写入 `program/last_page_id.txt`。

辅助能力：

- `--append-tags`：给最近页面追加野生标签。
- `--update-album`：给最近页面更新归属专辑。
- `program/update_album_map.py`：从 Notion 专辑 Relation 子库刷新 `program/album_map.json`。
- `program/configure.py`：写入本地 Notion token 和数据库 ID。

## 收藏管理台

2026-07-10 新增本地 Web 收藏管理台路线，用于把项目从“保存小红书笔记”推进到“管理小红书收藏”。

核心文件：

- `program/notion_manager.py`：查询 Notion 内容总库、按标题/作者/标签/状态/专辑过滤、批量追加专辑 Relation。
- `program/manage_server.py`：本地 HTTP 服务，默认监听 `http://127.0.0.1:8765`。
- `program/web/`：管理台前端，包含搜索框、过滤器、结果表格、多选和追加到专辑操作。

该功能遵循 `doc/NOTE_MANAGEMENT_CONSOLE_GUIDE.md`：第一版只实现“追加到专辑”，保留原有 Relation，不做覆盖式移动。

## Notion Schema

Python CLI 当前使用的目标数据库字段：

| 字段 | 类型 |
| --- | --- |
| `标题` | Title |
| `小红书链接` | URL |
| `简介` | Rich text |
| `作者` | Rich text |
| `状态` | Select |
| `野生标签` | Rich text |
| `彩色标签` | Multi-select |
| `库B：专辑标签库` | Relation |

## 参考路线：Edge 扩展

`references/4.edge_with_notion` 是 Edge 浏览器插件实现，用于在小红书列表页滚动抓取卡片，导出 CSV/HTML/Markdown，或直接同步到 Notion。它还会打开后台标签页提取话题标签，并支持增量同步模式。

注意：Edge 扩展使用的 Notion 字段是 `笔记标题`、`笔记链接`、`作者名称`、`标签`，与 Python CLI 的内容总库字段不同。后续若要合并两条路线，需要先统一数据库 schema。

## 当前技术债

- `program/config.json` 是本地私密配置，应保留在本机但不再提交。
- `doc` 中的早期设置文档仍描述旧版 `Name / URL / Summary` 数据库结构，仅作历史参考。
- `references/trigger.js` 仍引用历史 PowerShell 脚本，当前主线不依赖它。
- Notion 请求里存在 `verify=False` 的开发期写法，长期使用应改成正常证书校验或明确代理配置。

## 后续建议

1. 统一 Python CLI 和 Edge 扩展的 Notion schema。
2. 给 `local_extractor.py` 增加离线 HTML fixture 测试，降低小红书页面结构变化带来的回归风险。
3. 将 `album_map.json` 的刷新流程文档化，并明确它是否应作为可提交数据。
4. 清理历史文档中的旧字段说明，保留当前路线为主说明。
