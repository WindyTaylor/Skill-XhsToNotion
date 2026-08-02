# 图片管理页设计交接 README

本文档用于新窗口继续指导 AI 落地 `http://127.0.0.1:8765/materials.html` 的新设计。

## 目标

图片管理页的核心不是展示图片，而是让用户能根据图片属性快速筛选出可用图片。页面应优先服务这些动作：

- 快速按 Notion 素材库字段筛图。
- 在结果里快速识别图片是否值得复刻、是否已拆解、评分高低。
- 选中图片后查看完整字段、学习点、复刻提示和跳转链接。
- 支持后续批量处理，例如批量改状态、批量标记适合复刻。

## 设计稿

- 设计图：`doc/materials-filter-design-v2.png`
- 可渲染 HTML：`doc/materials-filter-design-v2.html`

上一版青绿色设计已废弃，不要继续沿用。

## 视觉方向

参考主页面 `program/web/styles.css` 的既有色板，但做成深色工作台版本：

- 主背景基于暖黑、棕黑：接近 `#24231f`、`#312e28`。
- 强调色沿用主页面紫色体系：`#534ab7`、`#afa9ec`、`#eeedfe`。
- 线条使用主页面米色线条的透明版本：`rgba(221, 215, 203, 0.2)`。
- 卡片圆角保持克制，建议 8px。
- 不使用青绿色科技风，不使用过强渐变背景。

## 强约束

- 图片卡片的图片区域上方不允许显示标题、比例、状态、标签等文字。
- 图片区域只允许显示图片本身和必要的选择框。
- 标题、状态、标签、评分、来源图片序号等信息放到图片下方正文区。
- 筛选项必须来自 Notion 素材库真实字段，不添加无来源的“热度”“主题”等虚构字段。

## 当前相关文件

- 页面入口：`program/web/materials.html`
- 页面逻辑：`program/web/materials.js`
- 样式文件：`program/web/styles.css`
- 服务路由：`program/manage_server.py`
- Notion 数据映射和查询：`program/notion_manager.py`

## 当前接口

图片管理页当前调用：

```text
GET /api/materials/photo
```

已支持查询参数：

- `q`：搜索标题、来源标题、作者、所有标签、学习点、复刻提示。
- `status`：按状态筛选。
- `tag`：按聚合标签 `all_tags` 模糊筛选。
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

## 落地建议

第一步先在现有 `materials.html` / `materials.js` / `styles.css` 上做 UI 升级，不要重写整套后台。

建议拆成三块：

1. 顶部查询区：保留搜索，增加当前筛选 token、排序/视图密度入口。
2. 左侧筛选区：展示状态、评分、适合复刻、来源图片序号、标签分组入口。
3. 结果和详情区：中间图片网格，右侧选中图片详情。

当前后端只有 `q/status/tag` 三类筛选。如果要让设计稿里的 `评分 4+`、`适合复刻`、`来源图片序号`、分组标签筛选真正生效，需要扩展 `query_photo_materials` 的参数和过滤逻辑，例如：

- `min_rating`
- `remake_ready`
- `image_index`
- `tag_group`
- `tag_value`

## 验收重点

- 打开 `http://127.0.0.1:8765/materials.html` 后能读取 `/api/materials/photo`。
- 深色配色与主页面色板有关联，不出现 v1 的青绿色科技风。
- 图片卡片上方没有任何文字覆盖。
- 筛选项名称与 Notion 素材库字段一致。
- 现有预览大图、原文链接、Notion 链接、加载更多功能不丢失。
