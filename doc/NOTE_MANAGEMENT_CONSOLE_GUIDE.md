# Notion 嵌入式搜索管理台实现指引

Updated: 2026-07-10

本文件用于保存“Notion 页面 + 嵌入式搜索管理台”功能的产品目标、实现边界和技术方案。后续任何 AI、Codex 窗口或开发任务在实现该功能前，都应先阅读本文件，避免因为上下文压缩或新会话导致需求丢失。

## 背景与目标

用户的初衷不是简单保存小红书链接，而是建立一个可以替代小红书收藏功能的个人笔记管理系统。

当前项目已经能把小红书笔记保存到 Notion 内容总库，并自动写入标题、链接、简介、作者、野生标签、彩色标签和专辑 Relation。下一阶段要补齐的是“收藏后的管理能力”：

- 能快速搜索已收藏笔记。
- 能按标题、作者、标签、专辑、状态等字段过滤。
- 能把搜索结果中选中的若干篇笔记批量复制或归档到新的专辑。
- 能持续加载更多搜索结果，并将不需要的笔记移入 Notion 回收站。
- 能直接维护供 DeepSeek 专辑推理参考的 `album_descriptions.json`。
- 能针对摄影类笔记进入“拆图”流程，手动选择 1 张或多张图片并沉淀到独立素材库。
- 能在 Notion 中通过一个页面入口使用这个管理台。

## 目标形态

在 Notion 中创建一个新页面，例如：

```text
小红书收藏管理台
```

页面内嵌一个本地或部署后的 Web 管理台。管理台提供：

- 搜索框：输入文字后搜索标题、简介、作者、野生标签。
- 过滤器：按标题、作者、野生标签、当前专辑、状态筛选。
- 结果列表：展示匹配笔记的核心字段。
- 多选框：选择一篇或多篇笔记。
- 目标专辑选择器：从 `album_map.json` 或 Notion 专辑库中读取。
- 批量操作按钮：把选中的笔记复制/追加到目标专辑。
- 管理操作：下滑加载更多结果；右键卡片封面可将笔记移入 Notion 回收站。

## 重要产品决策

### 1. “复制到新专辑”优先解释为追加专辑

用户说“复制到一个新的专辑中去”。对笔记管理系统来说，更好的语义是：

```text
保留原专辑，同时追加一个新的专辑 Relation。
```

原因：

- 一篇笔记可能同时属于多个主题，例如“AI + Notion + 自动化”。
- 追加 Relation 更接近知识管理系统，而不是小红书单一收藏夹。
- 不会破坏原有分类。

因此第一版应默认实现“追加到目标专辑”。如果未来需要“移动到目标专辑”，再提供单独操作。

建议操作命名：

- `追加到专辑`
- `移动到专辑`

第一版只实现 `追加到专辑` 即可。

### 2. 不要把 Notion token 暴露到前端

嵌入式 Web 管理台不能直接在浏览器端保存或调用 Notion API token。

正确架构：

```text
浏览器前端 -> 本地/服务端 API -> Notion API
```

其中 Notion API token 只存在于：

- `program/config.json`
- 环境变量
- 后端进程内存

不要写入 HTML、JS、浏览器 localStorage 或 URL 参数。

### 3. Notion 页面只是入口，不承载复杂逻辑

Notion 原生页面不能实现真正可编程的搜索框、勾选和批量复制逻辑。Notion 页面负责嵌入 Web 管理台；搜索、筛选、选择和批量更新由 Web 管理台完成。

## 当前 Notion Schema

当前 Python CLI 面向内容总库，字段名如下：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `标题` | Title | 笔记标题 |
| `小红书链接` | URL | 原始或最终小红书链接，用于查重 |
| `简介` | Rich text | 笔记正文或描述 |
| `作者` | Rich text | 作者昵称 |
| `状态` | Select | 默认 `待阅读` |
| `野生标签` | Rich text | 小红书标签或手动追加标签 |
| `彩色标签` | Multi-select | 从野生标签拆分出的彩色标签，用于 Notion 画廊卡片展示 |
| `库B：专辑标签库` | Relation | 关联专辑标签库 |

实现本功能时，先以这些字段为准。若新增字段，必须同步更新：

- `README.md`
- `program/README.md`
- `program/SKILL.md`
- 本文件

## 摄影拆图素材库

管理台提供笔记卡片级“拆图”入口。该功能不做 AI 分析，只负责：

- 提取或读取当前笔记的全部图片。
- 让用户手动勾选要沉淀的图片。
- 将用户填写的构图标签、动作标签、场景、景别、机位角度、主体类型、光线标签、色彩标签、情绪氛围、学习点、复刻提示、状态、评分和是否适合复刻写入独立 Notion 素材库。

素材库 ID 由 `NOTION_MATERIAL_DATABASE_ID` 配置，可选 `NOTION_MATERIAL_DATA_SOURCE_ID`。建议素材库字段为：`标题`、`图片`、`图片链接`、`来源笔记`、`原文链接`、`来源标题`、`作者`、`构图标签`、`动作标签`、`光线标签`、`色彩标签`、`场景`、`景别`、`机位角度`、`主体类型`、`情绪氛围`、`学习点`、`复刻提示`、`状态`、`来源图片序号`、`适合复刻`、`评分`。后端应只写入实际存在且类型匹配的字段。Notion 中建议建立 Gallery 视图，并按 `色彩标签`、`动作标签`、`构图标签` 和 `适合复刻` 建常用筛选视图。

## 第一版范围

第一版目标是做出可用的本地 Web 管理台，允许用户在浏览器中操作，再把页面地址嵌入 Notion。

### 必须实现

- 启动本地后端服务，例如：

```powershell
python program/manage_server.py
```

- 默认监听：

```text
http://127.0.0.1:8765
```

- 页面功能：
  - 搜索输入框。
  - 作者过滤。
  - 标签过滤。
  - 标题关键词过滤。
  - 专辑过滤。
  - 状态过滤。
  - 结果列表。
  - 滚动加载更多结果。
  - 多选笔记。
  - 目标专辑下拉选择。
  - 批量追加到目标专辑。
  - 将单篇笔记移入 Notion 回收站。

- 后端功能：
  - 读取 `program/config.json` 或环境变量。
  - 查询 Notion 内容总库。
  - 读取专辑映射。
  - 支持搜索和过滤。
  - 支持批量追加 Relation。
  - 支持将单篇笔记移入 Notion 回收站。
  - 操作前校验目标专辑存在。
  - 操作后返回成功、失败和跳过数量。

### 暂不实现

- 用户登录系统。
- 多用户权限。
- 云端部署。
- 全文向量搜索。
- AI 自动聚类。
- 永久删除 Notion 页面（管理台仅支持移入 Notion 回收站）。
- 复杂拖拽式专辑层级管理（当前仅支持专辑列表顺序拖拽排序）。

这些可作为后续阶段。

## 推荐文件结构

建议新增：

```text
program/
├── manage_server.py          # 本地 Web 管理台后端入口
├── notion_manager.py         # Notion 查询、过滤、批量 Relation 更新和回收站逻辑
└── web/
    ├── index.html            # 管理台页面
    ├── app.js                # 前端交互逻辑
    └── styles.css            # 样式
```

如果第一版希望减少文件数量，也可以先把 HTML/CSS/JS 内嵌在 `manage_server.py` 中。但长期维护建议拆成 `program/web/`。

## 推荐 API 设计

后端可以使用 Python 标准库 `http.server` 实现，避免新增复杂依赖。若后续需要更强可维护性，再考虑 Flask/FastAPI。

### `GET /api/albums`

返回专辑列表。

响应示例：

```json
{
  "albums": [
    {"name": "学习AI编程", "id": "notion-page-id"},
    {"name": "积累拍照灵感", "id": "notion-page-id"}
  ]
}
```

### `POST /api/albums`

直接操作真实 Notion 专辑库。

- `action=create`：创建专辑，必须提供 `album_name` 和六大主题之一的 `domain`。
- `action=rename`：按专辑名或页面 ID 定位专辑，使用 `new_name` 重命名。
- 创建成功后同步 `album_map.json` 与 `album_domains.json`。
- 重命名不改变专辑页面 ID，因此已有笔记 Relation 保持不变；同时迁移 `album_map.json`、`album_domains.json` 和 `album_descriptions.json` 中的名称键。

### `POST /api/albums/order`

保存管理台中的人工专辑顺序。请求体传入 `album_ids` 数组，后端会过滤不存在的 ID，并把遗漏的现有专辑自动追加到末尾，最终写入 `album_order.json`。`GET /api/albums` 和 `GET /api/album-descriptions` 都按该顺序返回，因此顶部专辑过滤、批量目标专辑和左侧 AI 专辑说明列表保持一致。

```json
{
  "album_ids": ["notion-page-id-1", "notion-page-id-2"]
}
```

### `GET /api/album-descriptions`

返回 `album_map.json` 中的全部专辑，并合并 `album_descriptions.json` 中已经填写的语义说明和 `album_domains.json` 中从 Notion「主领域」同步的分类。

### `POST /api/album-descriptions`

保存或清空一个专辑的 AI 语义说明。`album_name` 必须来自当前专辑映射；`description` 为空字符串时表示清空说明，不会删除 Notion 专辑。前端将说明拆成“收录什么”“排除什么”“与相近专辑的区别”三个输入区，保存时使用带标题的文本组合为一个 `description`，从而保持 CLI 与 DeepSeek 提示词兼容；旧版自由文本载入第一个输入区。

```json
{
  "album_name": "积累拍照灵感",
  "description": "用于收集拍摄主题、画面构思、姿势、场景和可复刻的出片灵感。"
}
```

### `GET /api/notes`

查询笔记列表。

支持 query 参数：

```text
q=关键词
title=标题关键词
author=作者关键词
tag=标签关键词
album=专辑名
status=状态
limit=100
cursor=notion_cursor
```

搜索语义：

- `q` 同时匹配 `标题`、`简介`、`作者`、`野生标签`。
- `title` 只匹配 `标题`。
- `author` 只匹配 `作者`。
- `tag` 只匹配 `野生标签`。
- `q`、`title`、`author`、`tag` 均可用半角 `+` 或全角 `＋` 分隔多个关键词；同一属性内采用 AND 语义，前后空格与重复词会被忽略。
- `album` 匹配 `库B：专辑标签库` Relation。
- `status` 匹配 `状态`。

响应示例：

```json
{
  "notes": [
    {
      "id": "notion-page-id",
      "title": "笔记标题",
      "url": "https://www.xiaohongshu.com/...",
      "summary": "简介",
      "author": "作者",
      "tags": "标签1, 标签2",
      "status": "待阅读",
      "albums": ["学习AI编程"]
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

### `POST /api/notes/add-to-album`

把选中的笔记追加到目标专辑。

请求示例：

```json
{
  "page_ids": ["page-id-1", "page-id-2"],
  "album_name": "学习AI编程",
  "mode": "append"
}
```

第一版只支持：

```json
{"mode": "append"}
```

后续可支持：

```json
{"mode": "move"}
```

响应示例：

```json
{
  "ok": true,
  "updated": 2,
  "skipped": 1,
  "failed": 0,
  "message": "已将 2 篇笔记追加到 学习AI编程，1 篇原本已在该专辑中。"
}
```

### `POST /api/notes/delete`

将单篇笔记移入 Notion 回收站。

请求示例：

```json
{
  "page_id": "page-id"
}
```

响应示例：

```json
{
  "ok": true,
  "archived": true,
  "page_id": "page-id",
  "title": "笔记标题",
  "message": "已将《笔记标题》移入 Notion 回收站。"
}
```

### `POST /api/covers/cache`

缓存封面到本地，可选上传到 Notion 并设置为页面封面。该接口是给管理台和后续浏览器扩展复用的本地后端能力，浏览器扩展不应直接保存 Notion token。

请求示例：
```json
{
  "source_url": "https://...",
  "page_id": "page-id",
  "upload_to_notion": true
}
```

响应示例：
```json
{
  "ok": true,
  "asset": {
    "id": "sha256",
    "filename": "sha256.jpg",
    "local_url": "/covers/sha256.jpg",
    "content_type": "image/jpeg",
    "size": 12345,
    "sha256": "sha256",
    "notion_file_upload_id": "file-upload-id"
  }
}
```

默认本地存储目录为 `program/data/covers/`，索引为 `program/data/cover_assets.json`。这些文件是运行时数据，不应提交到 Git。

## Notion 查询实现要点

### 查询策略

Notion API 的数据库查询支持 filter，但全文搜索能力有限。第一版可以采用：

1. 根据能下推到 Notion 的条件构造 Notion filter。
2. 拉取一页或多页结果。
3. 在本地对 `q`、`title`、`author`、`tag` 做字符串包含匹配。

建议第一版限制最大返回数量，例如 100 或 200 条，避免一次拉取过多导致慢。

### Relation 追加逻辑

当前 `NotionSaver.update_album()` 会覆盖 `库B：专辑标签库`：

```text
relation = [{"id": album_id}]
```

本功能需要新增“追加 Relation”逻辑：

1. GET 当前页面，读取已有 `库B：专辑标签库.relation`。
2. 如果目标专辑 id 已存在，跳过该页面。
3. 如果不存在，把目标专辑 id 追加到 relation 数组末尾。
4. PATCH 页面属性，写回完整 relation 数组。

伪代码：

```python
current = get_page(page_id)
relations = current["properties"]["库B：专辑标签库"]["relation"]
ids = [item["id"] for item in relations]
if target_album_id not in ids:
    relations.append({"id": target_album_id})
    patch_page(page_id, {"库B：专辑标签库": {"relation": relations}})
```

不要复用现有覆盖式 `update_album()` 来实现追加。

## 前端交互草图

页面应直接呈现管理台，而不是营销式说明页。

建议布局：

```text
顶部工具栏：
[搜索框........................] [状态] [专辑] [作者] [标签] [搜索]

批量操作栏：
[已选 N 篇] [目标专辑下拉] [追加到专辑]

左侧可收起工作区：
[六大主领域] [当前分类内的专辑列表] [AI 专辑语义说明编辑器]

结果表格：
[ ] 标题 | 作者 | 标签 | 当前专辑 | 状态 | 小红书链接
```

基本交互：

- 输入搜索词后按 Enter 搜索。
- 上传背景应在前端自动缩放压缩并立即应用；成功持久化时保存到当前浏览器，文件过大、读取失败或本地存储受限时必须给出页面内状态提示。
- 综合搜索、标题、作者和标签输入框应实现为 Token Field：输入半角 `+` 或全角 `＋` 生成独立关键词 token，例如 `日系 + 制服`；回车和失焦会提交草稿，退格/删除可移除已选 token，最终查询仍使用同一属性内 AND 语义。
- 修改过滤器后可点击搜索。
- 表头提供全选当前页。
- 每行提供打开 Notion 页面和打开小红书链接。
- 结果卡片作者名采用可点击身份胶囊，点击只复制作者名，不触发卡片选中；复制后提供短暂状态反馈。
- 野生标签使用由标签文字稳定决定的彩色胶囊，同名标签保持同色；专辑 Relation 标签继续使用统一专辑色，避免两类信息混淆。
- 普通标签颜色保持柔和，不使用高饱和大红色。
- “专辑管理”提供“创建新专辑”和“更改名字”；新建时要求选择六大主领域，重命名时保留原有笔记关联和 AI 语义说明。
- 批量整理区必须保留真实的 `button`、`select` 等原生控件；键盘焦点使用 `:focus-visible` 和系统 `Highlight` 色绘制焦点环，所属操作卡片仅用 `:has(:focus-visible)` 提供分组提示。禁用控件由原生 `disabled` 跳过，过长内容以省略号显示但不能改写真实值或控件语义。
- 批量追加成功后刷新结果列表。
- 下滑到列表底部时自动加载更多结果。
- 右键卡片封面可打开管理菜单，将笔记移入 Notion 回收站。
- “AI 专辑语义说明”在宽屏停靠到主内容左侧空白区，窄屏作为覆盖式抽屉；关闭后保留触发按钮并记住上次展开状态。
- 专辑选择按 Notion 专辑库的六个「主领域」分组，分类后再搜索，避免在完整专辑列表中长距离滚动。
- 专辑说明编辑器提供“收录什么”“排除什么”“与相近专辑的区别”三个独立输入区，并显示完成项数与组合后的总字符数。
- 成功/失败消息显示在页面顶部，不用弹窗阻塞。

## 安全与隐私要求

- 不在前端暴露 Notion token。
- 不把 `program/config.json` 提交到 Git。
- 不把搜索结果缓存到仓库文件。
- 不在日志里打印完整 Notion token。
- 本地服务默认只监听 `127.0.0.1`，不要默认监听 `0.0.0.0`。
- 如果未来部署到公网，必须增加认证。

## Notion 页面嵌入方式

第一版本地使用时：

1. 启动服务：

```powershell
python program/manage_server.py
```

2. 浏览器访问：

```text
http://127.0.0.1:8765
```

3. 在 Notion 页面中使用 `/embed` 嵌入该地址。

注意：Notion 对本地地址嵌入可能受客户端和网络策略影响。如果 Notion 客户端无法嵌入 `127.0.0.1`，则先使用浏览器打开本地管理台；后续再考虑部署到局域网或云端。

### 启动页 + HTTPS 隧道组合

为了减少手动输入命令，可增加一个 Notion 可嵌入的启动页：

- `program/web/notion_launcher.html`：静态 HTML，不包含 Notion token，只提供一个本地启动按钮。
- `program/install_console_protocol.ps1`：注册 `xhs-notion-console://` Windows 用户级协议，同时为当前用户安装登录自启动服务。
- `program/start_management_console.ps1`：被协议唤起后启动本地服务；在 `mode=cloudflared-quick` 时尝试启动 Cloudflare Quick Tunnel。

使用方式：

```powershell
powershell -ExecutionPolicy Bypass -File program/install_console_protocol.ps1
```

安装脚本会立即启动本地服务，并让它在当前 Windows 用户下次登录时自动后台启动。Notion 收藏中心的主按钮应直接链接 `http://127.0.0.1:8765`，避免沙箱拦截自定义协议。也可以在 Notion 中上传或嵌入 `program/web/notion_launcher.html` 作为手动启动兜底。点击“启动小红书收藏管理”会尝试启动本地服务并打开管理台。如果需要生成 `https://*.trycloudflare.com` 地址，可手动运行 `start_management_console.ps1 -Mode cloudflared-quick`，复制后用于 Notion `/embed`。

边界：

- HTML/Notion 不能直接执行本地程序，必须通过用户主动注册的系统协议唤起脚本。
- Notion 上传的 HTML 运行在沙箱 iframe 中，部分客户端可能会拦截外部协议和弹窗；按钮无反应时应改用直接本地地址、浏览器书签或桌面快捷方式。
- Cloudflare Quick Tunnel 地址不是固定地址，重启后可能变化。
- 固定公开入口需要 Cloudflare Named Tunnel、自有域名或云端部署，并必须增加认证。

## 后续阶段建议

### 第二阶段

- 增加保存搜索条件的能力。
- 增加“移动到专辑”。
- 增加“从专辑移除”。
- 支持按创建时间、最近编辑时间排序。
- 支持批量改状态。

### 第三阶段

- 生成某个专辑的整理页。
- 自动总结搜索结果。
- 相似笔记检测。
- AI 推荐应该追加到哪些专辑。
- 每周收藏回顾页。

## 验收标准

第一版完成时，应满足：

- 可以通过 `python program/manage_server.py` 启动本地服务。
- 浏览器能打开管理台页面。
- 能读取 Notion 内容总库笔记。
- 能按文本、标题、作者、标签、专辑、状态筛选。
- 能滚动加载更多搜索结果。
- 能多选搜索结果。
- 能选择目标专辑。
- 能把选中的笔记追加到目标专辑，且不会删除原有专辑。
- 如果笔记已经在目标专辑中，应跳过而不是重复写入。
- 能将单篇笔记移入 Notion 回收站，并从当前结果列表移除。
- 操作后页面能显示清晰的成功/失败结果。
- Notion token 不出现在前端代码或浏览器页面源码中。

## 实现前必读文件

开发此功能前，至少阅读：

- `doc/PROJECT_WORKSPACE_GUIDE.md`
- `doc/NOTE_MANAGEMENT_CONSOLE_GUIDE.md`
- `program/README.md`
- `program/SKILL.md`
- `program/xiaohongshu_to_notion_cli.py`
- `program/update_album_map.py`
- `program/config.py`

实现完成后，视情况更新：

- `README.md`
- `program/README.md`
- `program/SKILL.md`
- `doc/PROJECT_SUMMARY.md`
