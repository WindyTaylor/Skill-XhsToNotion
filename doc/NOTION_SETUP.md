# Notion 配置指南

本文档面向第一次使用本 skill 的用户，说明如何准备 Notion integration、内容总库和专辑库。

如果你让 AI 编程工具帮你初始化，可以把仓库地址交给 AI，并让它阅读 `doc/AI_INIT.md`。如果 AI 工具没有 Notion 操作能力，就按本文手动完成 Notion 配置。

## 你需要准备什么

- 一个 Notion 账号和工作区。
- 一个 Notion integration token。
- 一个内容数据库，也叫 `库A：小红书内容总库`。
- 一个专辑数据库，也叫 `库B：专辑标签库`。
- 把 integration 授权给这两个数据库或它们所在的父页面。

Notion 官方把 integration 称为 connection。内部 integration 使用一个固定 API token，适合这种个人自动化脚本；公开 OAuth 应用不是本项目的目标。

官方入口：

- Notion integrations: https://www.notion.so/my-integrations
- Notion API docs: https://developers.notion.com/

## 推荐方式：复制公开模板

优先复制项目提供的公开 Notion 模板，而不是手动创建数据库：

```text
https://grass-subway-525.notion.site/Notion-3e20eae5d4b48161a011df97ca905557?source=copy_link
```

模板页面应命名为类似：

```text
小红书转 Notion 公开模板发布版
```

复制模板时注意：

- 只复制公开模板页面，不要使用作者正在运行的个人页面。
- 复制后页面会进入你自己的 Notion 工作区。
- 模板中的 `库A：内容总库` 应为空库；`库B：专辑标签库` 可以包含预设分类行。
- 复制完成后，仍然需要创建自己的 Notion integration，并把 integration 授权给复制后的模板页面或其中两个数据库。
- 然后继续执行本文的“第五步：配置本地 skill”。

### 让 AI 继续配置本地 skill

在继续之前，请确认你已经完成：

- 已复制公开 Notion 模板到自己的工作区。
- 已创建自己的 Notion integration。
- 已把 integration 授权给复制后的模板页面或数据库。
- 已准备好 Notion token。

然后把下面这句话交给自己的 AI 编程工具：

```text
请帮我 clone 这个 skill 工程：<repo-url>。
我已经复制了公开 Notion 模板，并完成了 Notion integration 授权。
clone 完成后，请在工程目录里阅读 README.md 和 doc/AI_INIT.md，指导我完成本地配置，
提取复制后模板里的数据库 ID，写入配置文件，
并运行一次测试，确认 skill 可以把小红书笔记保存到我的 Notion。
```

如果 AI 工具有 Notion 连接能力，它可以帮你检查复制后的 `库A：内容总库`、`库B：专辑标签库` 是否存在，并确认库 A 中的 `库B：专辑标签库` Relation 指向库 B。如果 AI 没有 Notion 连接能力，它仍然可以根据本文档指导你在 Notion UI 中完成这些操作。

如果没有公开模板链接，或者你希望从零开始搭建，则按下面步骤手动创建库 A 和库 B。

## 第一步：创建 Notion integration

1. 打开 https://www.notion.so/my-integrations。
2. 点击 `New integration`。
3. 填写名称，例如 `小红书转 Notion`。
4. 选择你的 Notion workspace。
5. 创建后进入 integration 设置页。
6. 复制 `Internal Integration Secret`，它就是后面要填入的 `NOTION_API_KEY`。

建议给 integration 至少开启这些能力：

- 读取内容。
- 插入内容。
- 更新内容。
- 读取和更新数据库结构。

如果你不确定具体选项，优先让 AI 工具帮你检查；否则在 Notion integration 设置里给这个内部 integration 足够的内容和数据库读写权限。

## 第二步：创建库 B：专辑标签库

先创建专辑库，因为内容库会通过 Relation 关联它。

在 Notion 中新建一个数据库，命名为：

```text
库B：专辑标签库
```

建议字段：

| 字段名 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `专辑名` 或 `Name` | Title | 是 | 专辑名称 |
| `主领域` | Select | 否 | 管理台用来分组展示专辑 |

至少创建一个专辑页面：

```text
未分类收件箱
```

如果你想使用管理台的领域分组，可以给 `主领域` 添加这些选项：

```text
🛠️ 硬核技术与职业效能
📸 视觉叙事与影像实验室
🦾 生活百科与生存技能
🌿 身心重塑与自我管理
📍 地理图志与探店计划
🎭 奇趣碎片与小众文化
```

## 第三步：创建库 A：小红书内容总库

在 Notion 中新建另一个数据库，命名为：

```text
库A：小红书内容总库
```

字段必须与脚本保持一致：

| 字段名 | 类型 | 必需 | 说明 |
| --- | --- | --- | --- |
| `标题` | Title | 是 | 小红书笔记标题 |
| `小红书链接` | URL | 是 | 原始或最终小红书链接，也用于查重 |
| `简介` | Rich text | 是 | 笔记正文或简介 |
| `作者` | Rich text | 是 | 作者昵称 |
| `状态` | Select | 是 | 至少包含 `待阅读` |
| `野生标签` | Rich text | 是 | 从小红书提取或手动追加的标签 |
| `彩色标签` | Multi-select | 是 | 用于 Notion Gallery 展示的标签 |
| `库B：专辑标签库` | Relation | 是 | 关联到 `库B：专辑标签库` |

创建 Relation 字段时，选择刚才创建的 `库B：专辑标签库` 作为关联目标。

## 第四步：授权 integration 访问数据库

Notion integration 不能默认访问你的所有页面。你需要把它添加到相关页面或数据库。

推荐做法：

1. 打开承载库 A、库 B 的父页面，或者分别打开两个数据库页面。
2. 点击右上角的 `...` 或 `Share`。
3. 找到 `Connections` 或 `Add connections`。
4. 添加刚才创建的 `小红书转 Notion` integration。
5. 确认库 A 和库 B 都能被该 integration 访问。

如果 API 返回 `403`、`object_not_found` 或提示没有权限，通常是因为 integration 还没有被添加到对应页面或数据库。

## 第五步：配置本地 skill

在项目目录中运行：

```powershell
python -m pip install -r requirements.txt
Copy-Item program/config_template.json program/config.json
python program/configure.py --api-key "<你的 Notion integration token>" --db-url "<库A页面URL或database ID>"
python program/update_album_map.py
```

`program/configure.py` 会把 token 和内容库 ID 写入本地 `program/config.json`。这个文件是私密配置，不要提交到 Git。

`program/update_album_map.py` 会读取库 A 中的 `库B：专辑标签库` Relation，找到库 B，并生成：

```text
program/album_map.json
program/album_domains.json
```

这些文件也是本地运行数据，不要提交到 Git。

## 第六步：验证配置

运行测试：

```powershell
python -m pytest
```

保存一条小红书笔记：

```powershell
python program/xiaohongshu_to_notion_cli.py `
  --url "https://www.xiaohongshu.com/explore/..." `
  --album "未分类收件箱"
```

启动本地管理台：

```powershell
python program/manage_server.py
```

默认访问：

```text
http://127.0.0.1:8765
```

## 常见问题

### 找不到数据库或 403

检查 integration 是否已经被添加到库 A、库 B 或它们的父页面。Notion API 只能访问明确授权给 integration 的内容。

### `update_album_map.py` 找不到专辑字段

确认库 A 中存在以下任一字段名：

- `库B：专辑标签库`
- `归属专辑`
- `专辑名`

推荐使用 `库B：专辑标签库`，类型必须是 Relation，并且关联到库 B。

### 保存成功但没有专辑

检查：

- `program/album_map.json` 是否存在。
- `program/update_album_map.py` 是否运行成功。
- 传入的 `--album` 名称是否和库 B 中的专辑页面标题一致。

### 是否必须配置 DeepSeek

不必须。作为 skill 使用时，由当前 AI agent 判断专辑并显式传入 `--album`。

只有你直接运行 CLI，并希望 CLI 自己生成专辑候选时，才需要配置 DeepSeek，并显式使用：

```powershell
python program/xiaohongshu_to_notion_cli.py --url "<xhs-url>" --auto-classify deepseek
```

### `program/config.json` 可以提交吗

不可以。它包含你的 Notion token 和数据库 ID，只能保存在本地或服务器私有环境中。
