const materialsState = {
  items: [],
  rawItems: [],         // items before client-side tag filtering (so re-applying filters works)
  loading: false,
  hasMore: false,
  nextCursor: "",
  tags: [],
  selectedId: null,
  filters: {
    tagValues: {},      // { composition: ['三分法', '留白'], color: ['低饱和'], ... }
  },
  excludeTags: [],      // 排除标签列表（字符串数组，跨所有标签组匹配）
  nav: "all",
  tagValuesByGroup: {}, // { composition: { '三分法': count, ... }, ... }
  quickGroups: ["mood", "clothing", "action"],
  photoFolders: [],
  activePhotoFolderId: null,
  // Drag & drop
  dragStartId: null,
};

// ===================== Card Order Persistence =====================
const CARD_ORDER_KEY = "materials_card_order";
const PHOTO_FOLDER_KEY = "materials_photo_folders";

/** Load saved card order from localStorage */
function loadCardOrder() {
  try {
    const raw = localStorage.getItem(CARD_ORDER_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(id => String(id)).filter(Boolean) : [];
  } catch { return []; }
}

/** Save current item id order to localStorage */
function saveCardOrder(ids) {
  try {
    const uniqueIds = [];
    const seen = new Set();
    ids.forEach(id => {
      const cleanId = String(id ?? "").trim();
      if (!cleanId || seen.has(cleanId)) return;
      seen.add(cleanId);
      uniqueIds.push(cleanId);
    });
    localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(uniqueIds));
  } catch (e) {
    console.warn("[materials] Failed to save card order:", e);
  }
}

function getMaterialId(item) {
  return String(item?.id ?? "").trim();
}

function mergeLoadedIdsIntoCardOrder() {
  const saved = loadCardOrder();
  const seen = new Set(saved);
  const merged = saved.slice();
  materialsState.rawItems.forEach(item => {
    const id = getMaterialId(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(id);
  });
  if (merged.length !== saved.length) saveCardOrder(merged);
  return merged;
}

/** Apply global saved order to the currently loaded materials. */
function applySavedOrder() {
  if (!materialsState.rawItems.length) return;
  const order = mergeLoadedIdsIntoCardOrder();
  if (!order.length) return;
  const orderMap = new Map(order.map((id, i) => [id, i]));
  const originalIndex = new Map(materialsState.rawItems.map((item, i) => [getMaterialId(item), i]));
  const fallbackBase = order.length + materialsState.rawItems.length;
  materialsState.rawItems.sort((a, b) => {
    const aId = getMaterialId(a);
    const bId = getMaterialId(b);
    const ai = orderMap.has(aId) ? orderMap.get(aId) : fallbackBase + (originalIndex.get(aId) || 0);
    const bi = orderMap.has(bId) ? orderMap.get(bId) : fallbackBase + (originalIndex.get(bId) || 0);
    return ai - bi;
  });
}

function saveVisibleCardOrder(visibleIds) {
  const nextVisibleIds = visibleIds.map(id => String(id ?? "").trim()).filter(Boolean);
  if (!nextVisibleIds.length) return;

  const visibleSet = new Set(nextVisibleIds);
  const order = mergeLoadedIdsIntoCardOrder();
  let visibleIndex = 0;
  const nextOrder = order.map(id => {
    if (!visibleSet.has(id)) return id;
    const nextId = nextVisibleIds[visibleIndex];
    visibleIndex += 1;
    return nextId;
  });

  while (visibleIndex < nextVisibleIds.length) {
    nextOrder.push(nextVisibleIds[visibleIndex]);
    visibleIndex += 1;
  }

  saveCardOrder(nextOrder);
}

// ===================== Drag & Drop Reorder =====================
function initDragDrop() {
  const grid = el.materialsGrid;
  if (!grid) return;

  grid.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".materials-card");
    if (!card) return;
    materialsState.dragStartId = card.dataset.materialId;
    card.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", materialsState.dragStartId);
    // Use a transparent drag image
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(img, 0, 0);
  });

  grid.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const card = e.target.closest(".materials-card");
    if (!card || card.dataset.materialId === materialsState.dragStartId) return;

    // Highlight drop target position
    const allCards = [...grid.querySelectorAll(".materials-card")];
    const dragIdx = allCards.findIndex(c => c.dataset.materialId === materialsState.dragStartId);
    const overIdx = allCards.indexOf(card);
    if (dragIdx < 0 || overIdx < 0 || dragIdx === overIdx) return;

    // Visual indicator: move the dragging class or add placeholder
    allCards.forEach(c => c.classList.remove("is-drag-over"));
    card.classList.add("is-drag-over");
  });

  grid.addEventListener("dragleave", (e) => {
    const card = e.target.closest(".materials-card");
    if (card) card.classList.remove("is-drag-over");
  });

  grid.addEventListener("drop", (e) => {
    e.preventDefault();
    const card = e.target.closest(".materials-card");
    if (!card || !materialsState.dragStartId) return;

    const fromId = materialsState.dragStartId;
    const toId = card.dataset.materialId;
    if (fromId === toId) return;

    // Reorder in both items and rawItems
    const fromIdx = materialsState.items.findIndex(i => getMaterialId(i) === fromId);
    const toIdx = materialsState.items.findIndex(i => getMaterialId(i) === toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = materialsState.items.splice(fromIdx, 1);
    materialsState.items.splice(toIdx, 0, moved);

    saveVisibleCardOrder(materialsState.items.map(getMaterialId));
    applySavedOrder();
    applyClientFilters();

    renderGrid();
  });

  grid.addEventListener("dragend", () => {
    materialsState.dragStartId = null;
    grid.querySelectorAll(".materials-card").forEach(c => {
      c.classList.remove("is-dragging", "is-drag-over");
    });
  });
}

// ===================== Tag Group Configuration =====================

const TAG_GROUP_ORDER = [
  "composition", "color", "action", "clothing", "mood", "people",
  "light", "scene", "time", "weather", "angle", "focal_length", "shot", "custom",
];

// 侧边栏不显示快速筛选组（情绪氛围/服装类型/动作标签已在主区域展示）
const SIDEBAR_TAG_ORDER = TAG_GROUP_ORDER.filter(g => !materialsState.quickGroups.includes(g));

const TAG_GROUP_LABELS = {
  composition: "构图标签",
  color: "色彩标签",
  action: "动作标签",
  clothing: "服装类型",
  mood: "情绪氛围",
  people: "人数类型",
  light: "光线标签",
  scene: "场景",
  time: "时间类型",
  weather: "天气类型",
  angle: "机位角度",
  focal_length: "焦段类型",
  shot: "景别",
  custom: "新增标签",
};

// 预定义的常用标签值（与拆图表单 placeholder 对齐）
// 当 Notion 数据库里这些标签还没被使用时也展示，方便用户知道有哪些选项
const STATIC_TAG_VALUES = {
  composition: ["三分法", "引导线", "留白", "可参考"],
  color: ["低饱和", "暖色", "对比色", "可参考"],
  action: ["站姿", "坐姿", "蹲姿", "躺姿"],
  clothing: ["水手服", "旗袍", "lolita", "清楚系", "ol"],
  mood: ["日系", "电影感", "氛围感", "日常感", "网感"],
  people: ["单人", "双人", "多人"],
  light: ["逆光", "顺光", "闪光灯"],
  scene: ["街拍", "人像", "室内", "探店", "街道", "场照", "大景"],
  time: ["白天", "夜景"],
  weather: ["晴天", "阴天"],
  angle: ["低机位", "俯拍", "平视", "侧面"],
  focal_length: ["广角", "50", "85", "长焦"],
  shot: ["特写", "半身", "全身", "大景", "空镜"],
  custom: [],
};

// DOM refs
const el = {};
function bindEl(id) { el[id] = document.querySelector("#" + id); }
[
  "materialsGrid", "materialsEmpty", "materialsMessage",
  "materialsSearchInput", "loadMoreMaterialsButton",
  "refreshMaterialsButton", "openMainButton",
  "materialPreviewOverlay", "materialPreviewImg", "materialPreviewClose",
  "materialsActiveFilters", "materialsActiveLeft", "materialsClearActiveBtn",
  "materialsClearFilters",
  "materialsRightPanel", "materialsDetailEmpty", "materialsDetailContent",
  "materialsDetailPreviewImg", "materialsDetailTitle",
  "materialsDetailMetaTags", "materialsDetailProps",
  "materialsDetailTagGroups", "materialsDetailLearning",
  "materialsDetailLearningText", "materialsDetailRemake",
  "materialsDetailRemakeText",   "materialsDetailSourceLink",
  "materialsDetailNotionLink", "materialsDetailPreviewBtn",
  "materialsDetailResplitBtn",
  "materialsDeselectBtn",
  "materialsNavAll", "materialsNavRemake",
  "materialsNavAllCount", "materialsNavRemakeCount",
  "materialsTagGroupsScroll", "materialsQuickFilters",
  "materialsCountText",
  "materialsExcludeInput", "materialsExcludeChips",
  "materialsPositiveTagsRow", "materialsPositiveChips",
  "materialsPhotoFolderSave", "materialsPhotoFoldersList",
].forEach(bindEl);

// ===================== Utilities =====================
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function buildQuery(values = {}) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    const cleanValue = String(value ?? "").trim();
    if (cleanValue) params.set(key, cleanValue);
  });
  return params.toString();
}

function uniqueCleanList(values = []) {
  const seen = new Set();
  const result = [];
  values.forEach(value => {
    const clean = String(value ?? "").trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    result.push(clean);
  });
  return result;
}

function cloneTagValues(tagValues = {}) {
  const cloned = {};
  Object.entries(tagValues).forEach(([groupKey, values]) => {
    if (!Array.isArray(values)) return;
    const cleanValues = uniqueCleanList(values);
    if (cleanValues.length > 0) cloned[groupKey] = cleanValues;
  });
  return cloned;
}

function makePhotoFolderId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `folder_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getCurrentPhotoFolderSnapshot() {
  return {
    tagValues: cloneTagValues(materialsState.filters.tagValues),
    excludeTags: uniqueCleanList(materialsState.excludeTags),
  };
}

function getPhotoFolderSnapshot(folder) {
  return {
    tagValues: cloneTagValues(folder?.tagValues || {}),
    excludeTags: uniqueCleanList(folder?.excludeTags || []),
  };
}

function hasPhotoFolderSnapshot(snapshot) {
  return Object.values(snapshot.tagValues || {}).some(values => values.length > 0) ||
    (snapshot.excludeTags || []).length > 0;
}

function stablePhotoFolderPayload(snapshot) {
  const tagValues = {};
  Object.keys(snapshot.tagValues || {}).sort().forEach(groupKey => {
    const values = uniqueCleanList(snapshot.tagValues[groupKey]).sort((a, b) => a.localeCompare(b, "zh"));
    if (values.length > 0) tagValues[groupKey] = values;
  });
  return JSON.stringify({
    tagValues,
    excludeTags: uniqueCleanList(snapshot.excludeTags || []).sort((a, b) => a.localeCompare(b, "zh")),
  });
}

function photoFolderSnapshotsEqual(a, b) {
  return stablePhotoFolderPayload(a) === stablePhotoFolderPayload(b);
}

// ===================== Tag Aggregation =====================
function aggregateTagValues() {
  const grouped = {};
  TAG_GROUP_ORDER.forEach(g => { grouped[g] = {}; });

  // 1) 用真实数据填充计数
  materialsState.rawItems.forEach(item => {
    const tags = item.tags || {};
    TAG_GROUP_ORDER.forEach(groupKey => {
      const groupTags = tags[groupKey];
      if (!Array.isArray(groupTags)) return;
      groupTags.forEach(tag => {
        if (!tag) return;
        if (!grouped[groupKey][tag]) grouped[groupKey][tag] = 0;
        grouped[groupKey][tag] += 1;
      });
    });
  });

  // 2) 合并预定义值（即使数据库里还没有，也展示为可用选项）
  TAG_GROUP_ORDER.forEach(groupKey => {
    const statics = STATIC_TAG_VALUES[groupKey] || [];
    statics.forEach(tag => {
      if (!grouped[groupKey][tag]) grouped[groupKey][tag] = 0;
    });
  });

  materialsState.tagValuesByGroup = grouped;
}

function itemMatchesTagSelection(item, selectedTags = {}) {
  const tags = item.tags || {};
  for (const [groupKey, selectedValues] of Object.entries(selectedTags)) {
    if (!Array.isArray(selectedValues) || selectedValues.length === 0) continue;
    const groupTags = tags[groupKey] || [];
    const hasMatch = selectedValues.some(value => groupTags.includes(value));
    if (!hasMatch) return false;
  }
  return true;
}

function itemMatchesExcludeTags(item, excludeTags = []) {
  const cleanExcludeTags = uniqueCleanList(excludeTags);
  if (cleanExcludeTags.length === 0) return true;

  const tags = item.tags || {};
  const allItemTags = new Set();
  for (const groupTags of Object.values(tags)) {
    if (Array.isArray(groupTags)) {
      groupTags.forEach(tag => { if (tag) allItemTags.add(tag); });
    }
  }
  if (item.title) allItemTags.add(item.title);
  if (item.author) allItemTags.add(item.author);
  if (item.source_title) allItemTags.add(item.source_title);

  return !cleanExcludeTags.some(excludeTag =>
    allItemTags.has(excludeTag) ||
    [...allItemTags].some(tag => tag.includes(excludeTag) || excludeTag.includes(tag))
  );
}

function itemMatchesPhotoFolder(item, folder) {
  const snapshot = getPhotoFolderSnapshot(folder);
  return itemMatchesTagSelection(item, snapshot.tagValues) &&
    itemMatchesExcludeTags(item, snapshot.excludeTags);
}

// ===================== Filter Application =====================
function applyClientFilters() {
  // Always start from raw items, apply tag filters
  const selectedTags = materialsState.filters.tagValues;
  const hasSelection = Object.values(selectedTags).some(arr => arr.length > 0);
  const hasExclusion = materialsState.excludeTags.length > 0;

  if (!hasSelection && materialsState.nav !== "remake" && !hasExclusion) {
    materialsState.items = materialsState.rawItems.slice();
    return;
  }

  materialsState.items = materialsState.rawItems.filter(item => {
    // Nav: remake ready
    if (materialsState.nav === "remake" && !item.remake_ready) return false;

    // Tag filters: AND across groups, OR within group
    if (!itemMatchesTagSelection(item, selectedTags)) return false;

    // Exclude tags: if ANY tag in the item matches an exclude tag, filter it out
    if (hasExclusion && !itemMatchesExcludeTags(item, materialsState.excludeTags)) return false;

    return true;
  });
}

// ===================== Active Filter Chips =====================
function renderActiveFilters() {
  const chips = [];

  // Tag filters
  Object.entries(materialsState.filters.tagValues).forEach(([groupKey, values]) => {
    if (!values || values.length === 0) return;
    values.forEach(v => {
      chips.push({ label: `${TAG_GROUP_LABELS[groupKey] || groupKey}: ${v}`, key: `tag_${groupKey}__${v}` });
    });
  });

  if (chips.length > 0) {
    el.materialsActiveFilters.style.display = "flex";
    el.materialsActiveLeft.innerHTML = chips.map(c =>
      `<span class="materials-active-filter-chip">${escapeHtml(c.label)}<button type="button" data-remove="${escapeAttr(c.key)}" title="移除">×</button></span>`
    ).join("");
  } else {
    el.materialsActiveFilters.style.display = "none";
  }

  el.materialsActiveLeft.querySelectorAll("button[data-remove]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.remove;
      const [type, ...rest] = key.split("__");
      const groupKey = type.replace(/^tag_/, "");
      const value = rest.join("__");
      toggleTagValue(groupKey, value);
    });
  });
}

// ===================== Photo Folders =====================
function loadPhotoFolders() {
  try {
    const raw = localStorage.getItem(PHOTO_FOLDER_KEY);
    const folders = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(folders)) return [];
    return folders
      .map(folder => {
        const snapshot = getPhotoFolderSnapshot(folder);
        return {
          id: String(folder.id || makePhotoFolderId()),
          name: String(folder.name || "未命名照片夹").trim() || "未命名照片夹",
          tagValues: snapshot.tagValues,
          excludeTags: snapshot.excludeTags,
          createdAt: folder.createdAt || new Date().toISOString(),
          updatedAt: folder.updatedAt || folder.createdAt || new Date().toISOString(),
        };
      })
      .filter(folder => hasPhotoFolderSnapshot(getPhotoFolderSnapshot(folder)));
  } catch (error) {
    console.warn("[materials] Failed to load photo folders:", error);
    return [];
  }
}

function savePhotoFolders() {
  try {
    localStorage.setItem(PHOTO_FOLDER_KEY, JSON.stringify(materialsState.photoFolders));
  } catch (error) {
    console.warn("[materials] Failed to save photo folders:", error);
    setMessage("照片夹保存失败：浏览器本地存储不可用。", "error");
  }
}

function syncActivePhotoFolder() {
  const current = getCurrentPhotoFolderSnapshot();
  const match = materialsState.photoFolders.find(folder =>
    photoFolderSnapshotsEqual(current, getPhotoFolderSnapshot(folder))
  );
  materialsState.activePhotoFolderId = match ? match.id : null;
}

function describePhotoFolder(folder) {
  const snapshot = getPhotoFolderSnapshot(folder);
  const parts = [];
  Object.entries(snapshot.tagValues).forEach(([groupKey, values]) => {
    values.forEach(value => parts.push(`${TAG_GROUP_LABELS[groupKey] || groupKey}: ${value}`));
  });
  snapshot.excludeTags.forEach(value => parts.push(`排除: ${value}`));
  return parts.join(" / ");
}

function renderPhotoFolders() {
  if (!el.materialsPhotoFoldersList || !el.materialsPhotoFolderSave) return;
  syncActivePhotoFolder();

  const currentSnapshot = getCurrentPhotoFolderSnapshot();
  el.materialsPhotoFolderSave.disabled = !hasPhotoFolderSnapshot(currentSnapshot);

  if (materialsState.photoFolders.length === 0) {
    el.materialsPhotoFoldersList.innerHTML = '<div class="materials-photo-folder-empty">暂无照片夹</div>';
    return;
  }

  el.materialsPhotoFoldersList.innerHTML = materialsState.photoFolders.map(folder => {
    const count = materialsState.rawItems.filter(item => itemMatchesPhotoFolder(item, folder)).length;
    const active = folder.id === materialsState.activePhotoFolderId;
    const title = describePhotoFolder(folder) || folder.name;
    return `
      <div class="materials-photo-folder-item">
        <button class="materials-photo-folder-btn${active ? " is-active" : ""}" type="button" data-folder-id="${escapeAttr(folder.id)}" title="${escapeAttr(title)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z"/>
          </svg>
          <span class="materials-photo-folder-name">${escapeHtml(folder.name)}</span>
          <span class="materials-photo-folder-count">${count}</span>
        </button>
        <button class="materials-photo-folder-delete" type="button" data-folder-delete="${escapeAttr(folder.id)}" title="删除照片夹">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/>
            <path d="M8 6V4h8v2"/>
            <path d="M6 6l1 15h10l1-15"/>
            <path d="M10 11v6"/>
            <path d="M14 11v6"/>
          </svg>
        </button>
      </div>
    `;
  }).join("");

  el.materialsPhotoFoldersList.querySelectorAll(".materials-photo-folder-btn[data-folder-id]").forEach(btn => {
    btn.addEventListener("click", () => applyPhotoFolder(btn.dataset.folderId));
  });
  el.materialsPhotoFoldersList.querySelectorAll(".materials-photo-folder-delete[data-folder-delete]").forEach(btn => {
    btn.addEventListener("click", () => deletePhotoFolder(btn.dataset.folderDelete));
  });
}

function saveCurrentPhotoFolder() {
  const snapshot = getCurrentPhotoFolderSnapshot();
  if (!hasPhotoFolderSnapshot(snapshot)) {
    setMessage("先选择或排除一些标签，再保存照片夹。", "error");
    return;
  }

  const existing = materialsState.photoFolders.find(folder =>
    photoFolderSnapshotsEqual(snapshot, getPhotoFolderSnapshot(folder))
  );
  const defaultName = existing?.name || `照片夹 ${materialsState.photoFolders.length + 1}`;
  const name = window.prompt("照片夹名称", defaultName);
  if (name === null) return;
  const cleanName = name.trim();
  if (!cleanName) return;

  const now = new Date().toISOString();
  if (existing) {
    existing.name = cleanName;
    existing.updatedAt = now;
  } else {
    materialsState.photoFolders.unshift({
      id: makePhotoFolderId(),
      name: cleanName,
      tagValues: snapshot.tagValues,
      excludeTags: snapshot.excludeTags,
      createdAt: now,
      updatedAt: now,
    });
  }

  savePhotoFolders();
  renderPhotoFolders();
  setMessage(`已保存照片夹「${cleanName}」。`, "success");
}

function applyPhotoFolder(folderId) {
  const folder = materialsState.photoFolders.find(item => item.id === folderId);
  if (!folder) return;
  const snapshot = getPhotoFolderSnapshot(folder);
  materialsState.filters.tagValues = cloneTagValues(snapshot.tagValues);
  materialsState.excludeTags = uniqueCleanList(snapshot.excludeTags);
  materialsState.nav = "all";
  updateNavButtons();
  deselectMaterial();
  applyClientFilters();
  renderTagGroups();
  renderQuickFilters();
  renderGrid();
  renderActiveFilters();
  renderExcludeChips();
  renderPositiveTags();
  renderPhotoFolders();
  updateMetrics();
  setMessage(`已套用照片夹「${folder.name}」。`, "success");
}

function deletePhotoFolder(folderId) {
  const folder = materialsState.photoFolders.find(item => item.id === folderId);
  if (!folder) return;
  if (!window.confirm(`删除照片夹「${folder.name}」？`)) return;

  materialsState.photoFolders = materialsState.photoFolders.filter(item => item.id !== folderId);
  if (materialsState.activePhotoFolderId === folderId) materialsState.activePhotoFolderId = null;
  savePhotoFolders();
  renderPhotoFolders();
  setMessage(`已删除照片夹「${folder.name}」。`, "success");
}

// ===================== Tag Selection =====================
function toggleTagValue(groupKey, value) {
  const dict = materialsState.filters.tagValues;
  if (!dict[groupKey]) dict[groupKey] = [];
  const arr = dict[groupKey];
  const idx = arr.indexOf(value);
  if (idx >= 0) {
    arr.splice(idx, 1);
  } else {
    arr.push(value);
  }
  applyClientFilters();
  renderTagGroups();
  renderQuickFilters();
  renderGrid();
  renderActiveFilters();
  renderPositiveTags();
  renderPhotoFolders();
  updateMetrics();
}

/**
 * 获取标签组的稳定显示顺序。
 * 优先使用预定义顺序 (STATIC_TAG_VALUES)，额外标签按中文名追加到末尾。
 * 这样点击选中/取消选中时标签不会跳位。
 */
function getStableTagOrder(groupKey) {
  const staticOrder = STATIC_TAG_VALUES[groupKey] || [];
  const allValues = materialsState.tagValuesByGroup[groupKey] || {};
  // 预定义标签按原顺序 + 其余标签按中文排序追加
  const ordered = [...staticOrder.filter(v => v in allValues)];
  const extra = Object.keys(allValues)
    .filter(v => !staticOrder.includes(v))
    .sort((a, b) => a.localeCompare(b, "zh"));
  return [...ordered, ...extra];
}

function clearAllFilters() {
  materialsState.filters.tagValues = {};
  materialsState.excludeTags = [];
  materialsState.nav = "all";
  updateNavButtons();
  applyClientFilters();
  renderTagGroups();
  renderQuickFilters();
  renderGrid();
  renderActiveFilters();
  renderExcludeChips();
  renderPositiveTags();
  renderPhotoFolders();
  updateMetrics();
}

// ===================== Exclude Tags =====================
function addExcludeTag(tag) {
  const t = tag.trim();
  if (!t) return;
  if (materialsState.excludeTags.includes(t)) return; // 去重
  materialsState.excludeTags.push(t);
  el.materialsExcludeInput.value = "";
  applyClientFilters();
  renderGrid();
  renderActiveFilters();
  renderExcludeChips();
  renderPhotoFolders();
  updateMetrics();
}

function removeExcludeTag(index) {
  materialsState.excludeTags.splice(index, 1);
  applyClientFilters();
  renderGrid();
  renderActiveFilters();
  renderExcludeChips();
  renderPhotoFolders();
  updateMetrics();
}

function renderExcludeChips() {
  if (!el.materialsExcludeChips) return;
  if (materialsState.excludeTags.length === 0) {
    el.materialsExcludeChips.innerHTML = "";
    return;
  }
  el.materialsExcludeChips.innerHTML = materialsState.excludeTags.map((tag, i) =>
    `<span class="materials-exclude-chip">${escapeHtml(tag)}<button type="button" data-exclude-idx="${i}" title="移除排除">×</button></span>`
  ).join("");
  el.materialsExcludeChips.querySelectorAll("button[data-exclude-idx]").forEach(btn => {
    btn.addEventListener("click", () => {
      removeExcludeTag(Number(btn.dataset.excludeIdx));
    });
  });
}

// ===================== Positive Tags Row =====================
function renderPositiveTags() {
  if (!el.materialsPositiveTagsRow || !el.materialsPositiveChips) return;

  // Collect all selected positive tags
  const positiveEntries = [];
  for (const [groupKey, values] of Object.entries(materialsState.filters.tagValues)) {
    if (!values || values.length === 0) continue;
    values.forEach(v => {
      positiveEntries.push({ groupKey, value: v, label: `${TAG_GROUP_LABELS[groupKey] || groupKey}: ${v}` });
    });
  }

  if (positiveEntries.length === 0) {
    el.materialsPositiveTagsRow.style.display = "none";
    return;
  }

  el.materialsPositiveTagsRow.style.display = "flex";
  el.materialsPositiveChips.innerHTML = positiveEntries.map(e =>
    `<span class="materials-positive-chip">${escapeHtml(e.label)}<button type="button" data-pos-group="${escapeAttr(e.groupKey)}" data-pos-value="${escapeAttr(e.value)}" title="取消选择">×</button></span>`
  ).join("");

  el.materialsPositiveChips.querySelectorAll("button[data-pos-group]").forEach(btn => {
    btn.addEventListener("click", () => {
      toggleTagValue(btn.dataset.posGroup, btn.dataset.posValue);
    });
  });
}

// ===================== Rendering Tag Groups =====================
function renderTagGroups() {
  if (!el.materialsTagGroupsScroll) return;
  const groupsHtml = SIDEBAR_TAG_ORDER.map(groupKey => {
    const values = materialsState.tagValuesByGroup[groupKey] || {};
    // 使用稳定顺序：预定义标签优先 + 额外标签追加，点击不会跳位
    const stableOrder = getStableTagOrder(groupKey);
    const chipsHtml = stableOrder.length > 0
      ? stableOrder.map(value => {
          const count = values[value] || 0;
          const selected = (materialsState.filters.tagValues[groupKey] || []).includes(value);
          let cls = "materials-tag-chip";
          if (selected) cls += " is-selected";
          else if (count === 0) cls += " is-zero";
          return `<span class="${cls}" data-tag-group="${escapeAttr(groupKey)}" data-tag-value="${escapeAttr(value)}" title="${count} 张">${escapeHtml(value)}</span>`;
        }).join("")
      : `<span class="materials-tag-chip is-zero">暂无</span>`;
    return `
      <div class="materials-tag-group">
        <div class="materials-tag-group-head">
          <h3>${escapeHtml(TAG_GROUP_LABELS[groupKey] || groupKey)}</h3>
        </div>
        <div class="materials-tag-chips">${chipsHtml}</div>
      </div>
    `;
  }).join("");

  el.materialsTagGroupsScroll.innerHTML = groupsHtml;

  el.materialsTagGroupsScroll.querySelectorAll(".materials-tag-chip[data-tag-group]").forEach(chip => {
    chip.addEventListener("click", () => {
      toggleTagValue(chip.dataset.tagGroup, chip.dataset.tagValue);
    });
  });
}

function renderQuickFilters() {
  if (!el.materialsQuickFilters) return;
  const html = materialsState.quickGroups.map(groupKey => {
    const values = materialsState.tagValuesByGroup[groupKey] || {};
    // 使用稳定顺序：预定义标签优先 + 额外标签追加，点击不会跳位
    const stableOrder = getStableTagOrder(groupKey);
    const chipsHtml = stableOrder.length > 0
      ? stableOrder.map(value => {
          const count = values[value] || 0;
          const selected = (materialsState.filters.tagValues[groupKey] || []).includes(value);
          let cls = "materials-tag-chip";
          if (selected) cls += " is-selected";
          else if (count === 0) cls += " is-zero";
          return `<span class="${cls}" data-tag-group="${escapeAttr(groupKey)}" data-tag-value="${escapeAttr(value)}" title="${count} 张">${escapeHtml(value)}</span>`;
        }).join("")
      : `<span class="materials-tag-chip is-zero">暂无</span>`;
    return `
      <div class="materials-quick-filter">
        <div class="materials-quick-filter-head">
          <h3>${escapeHtml(TAG_GROUP_LABELS[groupKey] || groupKey)}</h3>
        </div>
        <div class="materials-tag-chips">${chipsHtml}</div>
      </div>
    `;
  }).join("");
  el.materialsQuickFilters.innerHTML = html;

  el.materialsQuickFilters.querySelectorAll(".materials-tag-chip[data-tag-group]").forEach(chip => {
    chip.addEventListener("click", () => {
      toggleTagValue(chip.dataset.tagGroup, chip.dataset.tagValue);
    });
  });
}

// ===================== Nav Buttons =====================
function updateNavButtons() {
  const btns = document.querySelectorAll(".materials-nav-btn");
  btns.forEach(b => b.classList.remove("is-active"));
  const activeMap = { all: el.materialsNavAll, remake: el.materialsNavRemake };
  const activeBtn = activeMap[materialsState.nav];
  if (activeBtn) activeBtn.classList.add("is-active");
}

function setNav(nav) {
  materialsState.nav = nav;
  updateNavButtons();
  deselectMaterial();
  applyClientFilters();
  renderGrid();
  renderActiveFilters();
  updateMetrics();
}

// ===================== API =====================
async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    method: options.method || "GET",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || `请求失败：${response.status}`);
  }
  return data;
}

function setMessage(message = "", type = "") {
  el.materialsMessage.textContent = message;
  el.materialsMessage.className = `materials-message${type ? " is-" + type : ""}`;
}

// ===================== Load & Render =====================
async function loadMaterials({ append = false } = {}) {
  if (materialsState.loading) return;
  materialsState.loading = true;
  setBusy(true);
  setMessage(append ? "正在加载更多素材..." : "正在读取图片素材...", "busy");

  try {
    const cursor = append ? materialsState.nextCursor : "";
    const params = new URLSearchParams();
    params.set("limit", "48");
    if (cursor) params.set("cursor", cursor);
    const q = el.materialsSearchInput.value.trim();
    if (q) params.set("q", q);

    const data = await requestJson(`/api/materials/photo?${params.toString()}`);
    const nextItems = data.materials || [];
    materialsState.rawItems = append ? [...materialsState.rawItems, ...nextItems] : nextItems;
    materialsState.hasMore = Boolean(data.has_more);
    materialsState.nextCursor = data.next_cursor || "";
    materialsState.tags = data.facets?.tags || materialsState.tags;

    applySavedOrder();

    // Re-aggregate tag values and apply filters
    aggregateTagValues();
    applyClientFilters();

    // Render (only on first load or when data changes meaningfully)
    if (!append) {
      renderTagGroups();
      renderQuickFilters();
    } else {
      // For append, just append tag chips that don't exist yet
      appendNewTagChips();
    }

    renderGrid();
    renderPhotoFolders();
    updateMetrics();
    setMessage(
      materialsState.items.length ? `已载入 ${materialsState.items.length} 张图片素材。` : "没有匹配的图片素材。",
      materialsState.items.length ? "success" : ""
    );
  } catch (error) {
    setMessage(error.message || "读取图片素材失败。", "error");
  } finally {
    materialsState.loading = false;
    setBusy(false);
  }
}

function appendNewTagChips() {
  // After loading more pages, new tags may appear.
  // For simplicity, just re-render everything (rare operation).
  renderTagGroups();
  renderQuickFilters();
}

function setBusy(isBusy) {
  el.refreshMaterialsButton.disabled = isBusy;
  el.loadMoreMaterialsButton.disabled = isBusy || !materialsState.hasMore;
  el.loadMoreMaterialsButton.textContent = isBusy ? "加载中..." : "加载更多";
}

function updateMetrics() {
  // Nav counts (from raw items, not filtered)
  if (el.materialsNavAllCount)
    el.materialsNavAllCount.textContent = String(materialsState.rawItems.length);
  if (el.materialsNavRemakeCount)
    el.materialsNavRemakeCount.textContent = String(materialsState.rawItems.filter(i => i.remake_ready).length);
}

// ===================== Grid Rendering =====================
function renderGrid() {
  el.materialsGrid.innerHTML = materialsState.items.map(renderCard).join("");
  el.materialsEmpty.classList.toggle("is-visible", materialsState.items.length === 0);
  el.loadMoreMaterialsButton.classList.toggle("is-hidden", !materialsState.hasMore);
  el.loadMoreMaterialsButton.disabled = materialsState.loading || !materialsState.hasMore;
  if (el.materialsCountText) {
    const total = materialsState.rawItems.length;
    const visible = materialsState.items.length;
    el.materialsCountText.textContent =
      visible === total ? `共 ${visible} 张图片` : `共 ${visible} / ${total} 张`;
  }
}

function renderCard(item) {
  const isSelected = item.id === materialsState.selectedId;
  const tagEntries = [];
  // First tag = status, treated specially
  if (item.status) tagEntries.push({ text: item.status, isStatus: true });
  // Then actual tags, up to 3
  const tags = (item.all_tags || []).slice(0, 3);
  tags.forEach(t => tagEntries.push({ text: t, isStatus: false }));

  const rating = Number(item.rating || 0);
  const starsHtml = rating ? `<span class="materials-card-stars">${"★".repeat(Math.max(1, Math.min(rating, 5)))}</span>` : "";

  const tagHtml = tagEntries.map(t =>
    `<span class="materials-card-tag${t.isStatus ? " is-status" : ""}">${escapeHtml(t.text)}</span>`
  ).join("");

  const imageHtml = item.image_url
    ? `<img src="${escapeAttr(item.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<div class="materials-card-image-fallback">无图片</div>`;

  const sourceLinkHtml = item.source_url
    ? `<a class="materials-card-source-link" href="${escapeAttr(item.source_url)}" target="_blank" rel="noreferrer" title="打开原文笔记">原文</a>`
    : "";

  return `
    <article class="materials-card${isSelected ? " is-selected" : ""}" data-material-id="${escapeAttr(item.id)}" draggable="true">
      <div class="materials-card-image">
        <div class="materials-card-select"></div>
        ${imageHtml}
        ${sourceLinkHtml}
      </div>
      <div class="materials-card-body">
        ${tagHtml ? `<div class="materials-card-tags">${tagHtml}</div>` : ""}
        ${starsHtml ? `<div class="materials-card-foot">${starsHtml}</div>` : ""}
      </div>
    </article>
  `;
}

// ===================== Selection & Detail Panel =====================
function selectMaterial(item) {
  materialsState.selectedId = item.id;
  renderGrid();
  renderDetail(item);
}

function deselectMaterial() {
  materialsState.selectedId = null;
  renderGrid();
  el.materialsDetailEmpty.style.display = "flex";
  el.materialsDetailContent.style.display = "none";
}

function renderDetail(item) {
  el.materialsDetailEmpty.style.display = "none";
  el.materialsDetailContent.style.display = "block";

  el.materialsDetailPreviewImg.src = item.image_url || "";
  el.materialsDetailPreviewImg.alt = item.title || "";

  el.materialsDetailTitle.textContent = item.title || "未命名";

  const metaTags = [];
  if (item.status) metaTags.push(`<span class="materials-detail-inline-tag is-accent">${escapeHtml(item.status)}</span>`);
  if (item.remake_ready) metaTags.push(`<span class="materials-detail-inline-tag is-accent">适合复刻</span>`);
  const rating = Number(item.rating || 0);
  if (rating) metaTags.push(`<span class="materials-detail-inline-tag">评分 ${rating}</span>`);
  el.materialsDetailMetaTags.innerHTML = metaTags.join("");

  const props = [];
  if (item.source_title) props.push({ label: "来源标题", value: item.source_title });
  if (item.author) props.push({ label: "作者", value: item.author });
  if (item.image_index) props.push({ label: "来源图片序号", value: String(item.image_index) });
  if (item.image_link) props.push({ label: "图片链接", value: "已保存" });
  else props.push({ label: "图片链接", value: "无" });

  if (props.length > 0) {
    el.materialsDetailProps.style.display = "grid";
    el.materialsDetailProps.innerHTML = props.map(p =>
      `<div class="materials-detail-prop"><span>${escapeHtml(p.label)}</span><strong>${escapeHtml(p.value)}</strong></div>`
    ).join("");
  } else {
    el.materialsDetailProps.style.display = "none";
  }

  // Tag groups: show ALL possible tags per group, with current values highlighted
  // User can click to add/remove tags
  try {
    const groupRows = [];
    TAG_GROUP_ORDER.forEach(key => {
      const label = TAG_GROUP_LABELS[key] || key;
      const currentTags = new Set((item.tags && item.tags[key]) || []);
      // Get all possible options: static + aggregated from all materials
      const staticOptions = STATIC_TAG_VALUES[key] || [];
      const allOptions = [...new Set([...staticOptions, ...Object.keys(materialsState.tagValuesByGroup[key] || {})])];

      if (allOptions.length === 0) return;

      const chipsHtml = allOptions.map(opt => {
        const hasIt = currentTags.has(opt);
        const cls = hasIt ? "materials-detail-tag-chip is-active" : "materials-detail-tag-chip";
        return `<span class="${cls}" data-tag-group="${escapeAttr(key)}" data-tag-value="${escapeAttr(opt)}">${escapeHtml(opt)}</span>`;
      }).join("");

      groupRows.push(`
        <div class="materials-detail-tag-row">
          <label>${escapeHtml(label)}</label>
          <div class="materials-detail-tag-row-body">${chipsHtml}</div>
        </div>
      `);
    });
    el.materialsDetailTagGroups.innerHTML = groupRows.join("") || '<div class="materials-detail-empty" style="min-height:40px"><span>暂无标签</span></div>';

    // Bind tag toggle buttons — click to add or remove (optimistic UI)
    const chips = el.materialsDetailTagGroups.querySelectorAll(".materials-detail-tag-chip[data-tag-group]");
    chips.forEach(chip => {
      chip.addEventListener("click", function () {
        const gk = this.dataset.tagGroup;
        const gv = this.dataset.tagValue;
        if (!gk || !gv) return;
        const isActive = this.classList.contains("is-active");
        // Optimistic: toggle visual state immediately
        if (isActive) {
          this.classList.remove("is-active");
          detailTagOptimisticRemove(item, gk, gv);
        } else {
          this.classList.add("is-active");
          detailTagOptimisticAdd(item, gk, gv);
        }
      });
    });
  } catch (err) {
    console.error("[materials] renderDetail tag section error:", err);
    el.materialsDetailTagGroups.innerHTML = '<div class="materials-detail-empty" style="min-height:40px"><span>标签渲染出错</span></div>';
  }

  if (item.learning_note && item.learning_note.trim()) {
    el.materialsDetailLearning.style.display = "block";
    el.materialsDetailLearningText.textContent = item.learning_note;
  } else {
    el.materialsDetailLearning.style.display = "none";
  }

  if (item.remake_hint && item.remake_hint.trim()) {
    el.materialsDetailRemake.style.display = "block";
    el.materialsDetailRemakeText.textContent = item.remake_hint;
  } else {
    el.materialsDetailRemake.style.display = "none";
  }

  el.materialsDetailSourceLink.href = item.source_url || "#";
  el.materialsDetailSourceLink.style.display = item.source_url ? "" : "none";
  el.materialsDetailNotionLink.href = item.url || "#";
  el.materialsDetailNotionLink.style.display = item.url ? "" : "none";
  el.materialsDetailPreviewBtn.style.display = item.image_url ? "" : "none";
}

function findItemById(id) {
  return materialsState.items.find(item => item.id === id);
}

// ===================== Detail Tag Add / Remove (Optimistic UI) =====================

/** Optimistically remove a tag locally, then sync to API */
function detailTagOptimisticRemove(item, groupKey, tagValue) {
  // Update local data immediately
  if (item.tags && item.tags[groupKey]) {
    item.tags[groupKey] = item.tags[groupKey].filter(t => t !== tagValue);
    if (item.all_tags) item.all_tags = item.all_tags.filter(t => t !== tagValue);
  }
  aggregateTagValues();
  renderTagGroups();
  renderQuickFilters();
  // Sync to API in background
  requestJson("/api/materials/photo/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { page_id: item.id, tag_group: groupKey, tag_value: tagValue, action: "remove" },
  }).catch(err => {
    console.error("[materials] API remove failed:", err);
    setMessage("删除标签失败: " + (err.message || "网络错误"), "error");
    // Revert: re-render detail to show actual state
    renderDetail(item);
  });
}

/** Optimistically add a tag locally, then sync to API */
function detailTagOptimisticAdd(item, groupKey, tagValue) {
  // Update local data immediately
  if (!item.tags) item.tags = {};
  if (!item.tags[groupKey]) item.tags[groupKey] = [];
  if (!item.tags[groupKey].includes(tagValue)) {
    item.tags[groupKey].push(tagValue);
    if (item.all_tags && !item.all_tags.includes(tagValue)) item.all_tags.push(tagValue);
  }
  aggregateTagValues();
  renderTagGroups();
  renderQuickFilters();
  // Sync to API in background
  requestJson("/api/materials/photo/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { page_id: item.id, tag_group: groupKey, tag_value: tagValue, action: "add" },
  }).then(data => {
    setMessage(data.message || "标签已更新。", "success");
  }).catch(err => {
    console.error("[materials] API add failed:", err);
    setMessage("添加标签失败: " + (err.message || "网络错误"), "error");
    // Revert: re-render detail to show actual state
    renderDetail(item);
  });
}

async function removeDetailTag(item, groupKey, tagValue) {
  try {
    await requestJson("/api/materials/photo/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_id: item.id,
        tag_group: groupKey,
        tag_value: tagValue,
        action: "remove",
      }),
    });
    // Update local data
    if (item.tags && item.tags[groupKey]) {
      item.tags[groupKey] = item.tags[groupKey].filter(t => t !== tagValue);
      if (item.all_tags) item.all_tags = item.all_tags.filter(t => t !== tagValue);
    }
    renderDetail(item);
    aggregateTagValues();
    renderTagGroups();
    renderQuickFilters();
    setMessage("标签已删除。", "success");
  } catch (error) {
    setMessage(error.message || "删除标签失败。", "error");
  }
}

async function addDetailTag(item, groupKey, tagValue) {
  try {
    await requestJson("/api/materials/photo/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_id: item.id,
        tag_group: groupKey,
        tag_value: tagValue,
        action: "add",
      }),
    });
    // Update local data
    if (!item.tags) item.tags = {};
    if (!item.tags[groupKey]) item.tags[groupKey] = [];
    if (!item.tags[groupKey].includes(tagValue)) {
      item.tags[groupKey].push(tagValue);
      if (item.all_tags && !item.all_tags.includes(tagValue)) item.all_tags.push(tagValue);
    }
    renderDetail(item);
    aggregateTagValues();
    renderTagGroups();
    renderQuickFilters();
    setMessage("标签已添加。", "success");
  } catch (error) {
    setMessage(error.message || "添加标签失败。", "error");
  }
}

let _appJsLoaded = false;
let _appJsLoadPromise = null;

function ensureAppJs() {
  if (_appJsLoaded) return Promise.resolve();
  if (_appJsLoadPromise) return _appJsLoadPromise;
  _appJsLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/app.js?v=20260802-material-bg-bridge";
    s.onload = () => { _appJsLoaded = true; resolve(); };
    s.onerror = () => reject(new Error("加载 app.js 失败"));
    document.head.appendChild(s);
  });
  return _appJsLoadPromise;
}

function openResplit(item) {
  const noteIds = item.source_note_ids;
  if (noteIds && noteIds.length > 0) {
    ensureAppJs()
      .then(() => {
        if (typeof openImagePicker === "function") {
          openImagePicker(noteIds[0]);
        } else {
          setMessage("拆图组件未加载完成，请稍后重试。", "error");
        }
      })
      .catch(() => {
        setMessage("加载拆图组件失败，请刷新页面重试。", "error");
      });
  } else {
    setMessage("该素材没有关联的来源笔记，无法重新拆图。", "error");
  }
}

// ===================== Lightbox (Center Enlarge) =====================
function ensureLightbox() {
  if (document.querySelector(".materials-lightbox")) return;
  const lb = document.createElement("div");
  lb.className = "materials-lightbox";
  lb.innerHTML = `
    <button class="materials-lightbox-close" type="button" aria-label="关闭">×</button>
    <img class="materials-lightbox-img" src="" alt="" referrerpolicy="no-referrer" />
    <div class="materials-lightbox-caption"></div>
  `;
  document.body.appendChild(lb);
  bindLightboxEvents(lb);
}

function bindLightboxEvents(lb) {
  lb.querySelector(".materials-lightbox-close").addEventListener("click", closeLightbox);
  lb.addEventListener("click", (e) => {
    if (e.target === lb) closeLightbox();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lb.classList.contains("is-open")) closeLightbox();
  });
}

function openLightbox(item) {
  ensureLightbox();
  const lb = document.querySelector(".materials-lightbox");
  const img = lb.querySelector(".materials-lightbox-img");
  img.src = item.image_url || "";
  img.alt = item.title || "";
  lb.querySelector(".materials-lightbox-caption").textContent = item.title || "";
  lb.classList.add("is-open");
  document.body.classList.add("lightbox-open");
}

function closeLightbox() {
  const lb = document.querySelector(".materials-lightbox");
  if (!lb) return;
  lb.classList.remove("is-open");
  document.body.classList.remove("lightbox-open");
}

// ===================== Event Binding =====================
function bindEvents() {
  // Search
  el.materialsSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      deselectMaterial();
      loadMaterials();
    }
  });

  // Exclude tags input
  if (el.materialsExcludeInput) {
    el.materialsExcludeInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addExcludeTag(el.materialsExcludeInput.value);
      }
    });
  }

  if (el.materialsPhotoFolderSave) {
    el.materialsPhotoFolderSave.addEventListener("click", saveCurrentPhotoFolder);
  }

  // Clear filters
  el.materialsClearFilters.addEventListener("click", clearAllFilters);
  el.materialsClearActiveBtn.addEventListener("click", clearAllFilters);

  // Nav buttons
  el.materialsNavAll.addEventListener("click", () => setNav("all"));
  el.materialsNavRemake.addEventListener("click", () => setNav("remake"));

  // Grid click — split: image area → enlarge; body area → select
  el.materialsGrid.addEventListener("click", (event) => {
    // 原文链接：由浏览器原生 <a> 处理，不走 JS
    if (event.target.closest(".materials-card-source-link")) return;

    const card = event.target.closest(".materials-card");
    if (!card) return;
    const id = card.dataset.materialId;
    const item = findItemById(id);
    if (!item) return;

    // 点击图片区域 → 居中放大
    const imageArea = event.target.closest(".materials-card-image");
    if (imageArea && item.image_url) {
      event.preventDefault();
      openLightbox(item);
      return;
    }

    // 点击卡片正文 → 切换选中态
    if (materialsState.selectedId === id) {
      deselectMaterial();
    } else {
      selectMaterial(item);
    }
  });

  // Detail panel: preview button → use lightbox
  el.materialsDetailPreviewBtn.addEventListener("click", () => {
    const item = findItemById(materialsState.selectedId);
    if (item && item.image_url) openLightbox(item);
  });

  // Detail panel: resplit button → open main page image picker
  el.materialsDetailResplitBtn.addEventListener("click", () => {
    const item = findItemById(materialsState.selectedId);
    if (item) openResplit(item);
  });

  // Detail panel: deselect
  el.materialsDeselectBtn.addEventListener("click", deselectMaterial);

  // Load more
  el.loadMoreMaterialsButton.addEventListener("click", () => loadMaterials({ append: true }));

  // Refresh
  el.refreshMaterialsButton.addEventListener("click", () => {
    deselectMaterial();
    loadMaterials();
  });

  // Open main page
  el.openMainButton.addEventListener("click", () => {
    window.open("/", "_blank", "noopener,noreferrer");
  });
}

// ===================== Init =====================
materialsState.photoFolders = loadPhotoFolders();
bindEvents();
initDragDrop();
updateNavButtons();
renderPhotoFolders();
loadMaterials();
