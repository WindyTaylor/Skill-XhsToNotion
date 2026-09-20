# 图片管理页实现交接 README

Updated: 2026-08-05

本文档用于说明 `http://127.0.0.1:8765/materials.html` 的当前实现状态和后续维护边界。该页面已经从早期设计稿进入可用实现阶段，核心目标是帮助用户整理参考图，并按 Notion 素材库字段快速筛选可复用图片。

## 当前目标

图片管理页的核心不是单纯展示图片，而是让用户能根据真实图片属性快速缩小范围，并沉淀可复刻的参考图。

- 按 Notion 摄影素材库字段筛选图片。
- 保存常用筛选组合为“照片夹”。
- 在不同筛选条件下拖动图片后，重新打开仍保持用户调整过的顺序。
- 选中图片后查看完整字段、学习点、复刻提示、原文链接和 Notion 页面链接。
- 在详情侧栏直接补充或移除标签，并同步写回 Notion。
- 支持从来源笔记重新进入拆图流程。

## 设计稿

- 设计图：`doc/materials-filter-design-v2.png`
- 可渲染 HTML：`doc/materials-filter-design-v2.html`

早期青绿色设计已废弃，不要继续沿用。当前实现以 `program/web/styles.css` 的主页面色板为基础，采用克制的浅色工作台布局。

## 当前相关文件

- 页面入口：`program/web/materials.html`
- 页面逻辑：`program/web/materials.js`
- 样式文件：`program/web/styles.css`
- 服务路由：`program/manage_server.py`
- Notion 数据映射和查询：`program/notion_manager.py`
- 拆图复用逻辑：`program/web/app.js`

## 当前页面结构

页面采用三栏布局：

1. 左侧侧边栏：品牌标题、快捷导航、照片夹、标签分组筛选、清空筛选按钮。
2. 中间主区域：搜索、快速标签筛选、排除标签、已选标签、结果计数、图片网格、加载更多。
3. 右侧详情栏：图片预览、来源信息、标签编辑、学习点、复刻提示、原文/Notion/大图/重新拆图操作。

移动端目前隐藏左右侧栏，后续如需移动端完整操作，需要补充侧栏打开入口。

## 已实现能力

### 标签筛选

- 快速筛选区显示 `mood`、`clothing`、`action` 三组常用标签。
- 左侧侧栏显示其余标签组。
- 同一标签组内是 OR 关系，不同标签组之间是 AND 关系。
- 标签值来自真实 Notion 数据，并合并 `STATIC_TAG_VALUES` 中的常用预设值。
- 排除标签跨所有标签组、标题、作者、来源标题匹配。

### 照片夹

照片夹是浏览器本地保存的筛选预设，不改 Notion schema。

- 存储键：`localStorage["materials_photo_folders"]`
- 保存内容：正向选中标签 `tagValues` 与排除标签 `excludeTags`
- 点击照片夹会恢复对应筛选条件并重新渲染图片。
- 照片夹右侧数字表示当前已加载素材中命中的图片数量。
- 只要当前筛选条件与某个照片夹完全一致，该照片夹会显示为选中态。

### 图片拖拽排序

拖拽排序使用一份全局顺序，而不是为每个筛选组合单独保存顺序。

- 存储键：`localStorage["materials_card_order"]`
- 无筛选时拖动：直接更新全局顺序。
- 有筛选或照片夹时拖动：只重排当前可见图片，并将它们嵌回全局顺序；不可见图片保持原有相对位置。
- 例：全局顺序为 `A B C D E`，当前筛选只显示 `B D E`，用户拖成 `E B D` 后，全局顺序变为 `A E C B D`。
- 页面重新打开或加载更多后，会先应用全局顺序，再执行当前筛选。

### 图片预览与详情

- 点击卡片图片区域打开居中大图。
- 点击卡片正文区域选中图片并更新右侧详情栏。
- 卡片图片区域不覆盖标题、状态、标签等文字，只保留图片、选择框和原文链接入口。
- 右侧详情栏会显示所有标签组选项，当前图片已有标签高亮。
- 点击详情标签会乐观更新 UI，并调用 `/api/materials/photo/update` 同步到 Notion。

### 重新拆图

详情栏的“重新拆图”会按需加载 `app.js`，复用主页面的 image picker。该逻辑不要在页面初始化时提前加载，否则容易因为 `index.html` 专属 DOM 缺失而报错。

## 当前接口

图片管理页调用：

```text
GET /api/materials/photo
```

已支持查询参数：

- `q`：搜索标题、来源标题、作者、所有标签、学习点、复刻提示。
- `cursor`：Notion 翻页游标。
- `limit`：每页数量，后端限制 1-100。

响应中的关键结构：

```text
{
  ok,
  materials,
  facets: { tags },
  has_more,
  next_cursor,
  limit
}
```

前端当前主要在客户端做标签筛选和照片夹筛选。若素材量明显变大，再考虑把分组标签、排除标签、评分、适合复刻等条件下沉到后端查询。

## 单张素材字段

单张图片素材字段来自 `page_to_photo_material`：

- `id`
- `url`
- `title`
- `image_url`
- `image_link`
- `source_url`
- `source_title`
- `source_note_ids`
- `author`
- `status`
- `rating`
- `image_index`
- `remake_ready`
- `learning_note`
- `remake_hint`
- `tags`
- `all_tags`
- `created_time`
- `last_edited_time`

`tags` 内部分组：

- `composition`：构图标签
- `color`：色彩标签
- `action`：动作标签
- `clothing`：服装类型
- `mood`：情绪氛围
- `people`：人数类型
- `light`：光线标签
- `scene`：场景
- `time`：时间类型
- `weather`：天气类型
- `angle`：机位角度
- `focal_length`：焦段类型
- `shot`：景别
- `custom`：新增标签

## Notion 素材库字段

字段常量在 `program/notion_manager.py`：

- `标题`
- `图片`
- `图片链接`
- `来源笔记`
- `原文链接`
- `来源标题`
- `作者`
- `构图标签`
- `动作标签`
- `光线标签`
- `色彩标签`
- `场景`
- `景别`
- `服装类型`
- `天气类型`
- `时间类型`
- `人数类型`
- `焦段类型`
- `机位角度`
- `情绪氛围`
- `新增标签`
- `学习点`
- `复刻提示`
- `状态`
- `来源图片序号`
- `适合复刻`
- `评分`

状态值：

- `待分析`
- `已拆解`
- `已复刻`
- `已内化`

## 维护注意事项

- 不要把照片夹写入 Notion，除非先设计单独的用户级 schema。
- 不要为每个筛选组合保存独立排序；当前全局顺序模型更稳定。
- 不要把临时封面调试页、服务日志、pid、`__pycache__`、`.pytest_cache` 提交到 Git。
- 不要直接提交 `program/data/`，其中包含封面缓存和运行索引。
- 修改 Notion 素材字段时，同步更新 `program/README.md`、`program/SKILL.md` 和本文档。

## 验收重点

- 打开 `http://127.0.0.1:8765/materials.html` 后能读取 `/api/materials/photo`。
- 图片卡片上方没有文字覆盖。
- 标签筛选、排除标签、照片夹套用结果一致。
- 筛选状态下拖动图片，刷新后顺序仍符合“可见子集嵌回全局顺序”。
- 详情栏标签增删能同步到 Notion，并且失败时有错误提示。
- 现有大图预览、原文链接、Notion 链接、加载更多、重新拆图功能不丢失。
