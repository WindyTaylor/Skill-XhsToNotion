# AI 初始化说明

本仓库是一个可由 AI 编程工具初始化的小红书转 Notion skill 模板。

## 目标

为当前用户自己的 Notion 工作区 clone 并初始化这个 skill。不要使用或索要作者的私有 Notion ID、本地配置、运行状态、截图或部署日志。

## 需要向用户确认的信息

1. Notion integration token。
2. 用户是要接入已有 Notion 数据库，还是创建一套全新的 Notion 配置。
3. 如果接入已有数据库：Notion 内容总库 URL 或 database ID。
4. 如果创建全新配置：用于创建数据库的 Notion 父页面 URL 或 page ID。
5. 用户是否已经有专辑 Relation 数据库，还是先从一个简单的收件箱专辑开始。
6. 可选 DeepSeek API key；仅当用户希望直接运行 CLI 并使用 `--auto-classify deepseek` 时需要。
7. 可选 Ubuntu 域名；仅当用户希望测试服务器部署时需要。

不要把以上信息提交到 Git。

## Notion 工作区初始化

负责初始化的 AI 可以帮助用户准备 Notion 工作区，而不是要求用户提前建好所有数据库。

### 使用公开模板

优先使用公开 Notion 模板：

```text
https://grass-subway-525.notion.site/Notion-3e20eae5d4b48161a011df97ca905557?source=copy_link
```

如果用户提供了另一个公开 Notion 模板链接，也可以使用用户指定的链接。模板应该是一套干净副本，不应包含作者个人收藏数据。

用户可以这样指挥自己的 AI 编程工具：

```text
clone 这个 skill：<repo-url>，复制这个 Notion 模板：https://grass-subway-525.notion.site/Notion-3e20eae5d4b48161a011df97ca905557?source=copy_link，并根据 doc/AI_INIT.md 完成初始化。
```

复制模板后，AI 需要：

1. 让用户在 Notion 中 Duplicate 模板到自己的工作区。
2. 让用户创建自己的 Notion integration token。
3. 指导用户把 integration 授权给复制后的模板页面，或至少授权给其中的 `库A：内容总库` 和 `库B：专辑标签库`。
4. 从复制后的页面中找到 `库A：内容总库`，使用它的 URL 或 database ID 运行 `program/configure.py`。
5. 运行 `program/update_album_map.py`，生成当前用户自己的 `album_map.json` 和 `album_domains.json`。
6. 如果用户的 AI 工具有 Notion 操作能力，可以由 AI 帮用户检查库 A/库 B schema、确认 Relation 字段存在、确认 integration 已授权；如果没有 Notion 操作能力，则把需要用户在 Notion UI 中点击的位置明确说出来。

不要使用作者原始 Notion 页面、作者真实数据库 ID 或作者本地配置。

### 全新配置

如果用户还没有兼容的 Notion 数据库，在用户提供的父页面下创建两个 Notion 数据库：

1. 内容数据库，也叫 `库A：小红书内容总库`。
2. 专辑数据库，也叫 `库B：专辑标签库`。

在内容数据库中创建以下属性：

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `标题` | Title | 小红书笔记标题 |
| `小红书链接` | URL | 原始或最终小红书链接 |
| `简介` | Rich text | 笔记正文或简介 |
| `作者` | Rich text | 作者昵称 |
| `状态` | Select | 至少包含默认流程值 `待阅读` |
| `野生标签` | Rich text | 提取到的标签或手动追加的标签 |
| `彩色标签` | Multi-select | 用于 Notion 画廊视图展示的拆分标签 |
| `库B：专辑标签库` | Relation | 关联到专辑数据库 |

在专辑数据库中创建以下属性：

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `专辑名` 或 `Name` | Title | 专辑名称 |
| `主领域` | Select | 可选分组字段，管理台会用它做领域分组 |

在专辑数据库中至少创建一个名为 `未分类收件箱` 的专辑页面，然后确保内容数据库的 Relation 属性指向这个专辑数据库。

数据库创建完成后，把内容数据库 URL 或 database ID 传给 `program/configure.py`，再运行 `program/update_album_map.py` 生成本地专辑映射文件。

### 接入已有配置

如果用户已经有 Notion 数据库，先检查内容数据库 schema。内容数据库必须包含以下任一名称的专辑关联属性：

- `库B：专辑标签库`
- `归属专辑`
- `专辑名`

如果缺少该属性，询问用户是否允许 AI 为内容数据库添加一个指向专辑数据库的 Relation 属性。如果当前 AI 工具有 Notion API 操作能力，可以直接创建或修复该属性；否则把需要手动添加的 Notion 字段准确告诉用户。

`program/update_album_map.py` 依赖这个属性工作：它会沿着 Relation 找到专辑数据库，并把专辑页面 ID 提取到 `program/album_map.json`。

## 本地初始化命令

```powershell
python -m pip install -r requirements.txt
Copy-Item program/config_template.json program/config.json
python program/configure.py --api-key "<notion-token>" --db-url "<notion-database-url-or-id>"
python program/update_album_map.py
python -m pytest
```

初始化过程中生成的本地文件都属于私有运行数据，不要提交到 Git，包括：

- `program/config.json`
- `program/album_map.json`
- `program/album_domains.json`
- `program/album_order.json`
- `program/album_descriptions.json`
- `program/last_page_id.txt`
- `program/last_album_candidates.json`

## Skill 调用行为

当这个 skill 由 AI agent 调用时，agent 应该从本地专辑映射中选择目标专辑，并显式传入 `--album`：

```powershell
python program/xiaohongshu_to_notion_cli.py --url "<xhs-url>" --album "<album-name>"
```

默认不要依赖 CLI 再调用另一个大语言模型。直接命令行用户如需备用自动分类，可以显式使用 `--auto-classify deepseek` 或 `--auto-classify keywords`。

## Ubuntu 测试部署

`deploy/ubuntu/` 是 Ubuntu 部署模板。

部署假设：

- 项目路径：`/opt/xhs-notion`
- Python 虚拟环境：`/opt/xhs-notion/.venv`
- systemd 用户和用户组：`xhsnotion`
- 本地服务地址：`http://127.0.0.1:8765`

启动服务前，服务器上应存在：

```bash
/opt/xhs-notion/program
/opt/xhs-notion/.venv
/etc/xhs-notion/xhs-notion.env
```

服务用户需要拥有项目目录：

```bash
sudo chown -R xhsnotion:xhsnotion /opt/xhs-notion
```

在 `/etc/xhs-notion/xhs-notion.env` 中填写服务器专用配置，尤其是：

- `ADMIN_PASSWORD`
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`

封面缓存行为：

- 如果 `COVER_CACHE_DIR` 为空，应用会把封面保存到 `program/data/covers`。
- 在上述模板路径下，实际目录是 `/opt/xhs-notion/program/data/covers`。
- 确保 `xhsnotion` 用户可以写入 `/opt/xhs-notion`。
- 只有当用户希望使用其他持久化缓存目录时，才需要设置 `COVER_CACHE_DIR`。

Nginx 对初次服务器测试不是必需的。先验证本地健康检查：

```bash
curl http://127.0.0.1:8765/api/health
```

如果要通过域名访问，把 `deploy/ubuntu/nginx.example.conf` 里的 `xhs-notion.example.com` 替换为用户自己的测试域名，并确保不要把密钥提交到 Git。
