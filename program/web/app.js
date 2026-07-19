const state = {
  albums: [],
  notes: [],
  selectedIds: new Set(),
  loading: false,
  hasMore: false,
  nextCursor: "",
  scanned: 0,
  contextNoteId: "",
  batchBusy: false,
  albumEditorMode: "create",
  albumEditorTargetId: "",
  albumEditorBusy: false,
  albumDescriptions: [],
  activeDescriptionAlbum: "",
  descriptionDomain: null,
  descriptionPanelOpen: false,
  descriptionBusy: false,
};

const BACKGROUND_STORAGE_KEY = "xhs-notion-console-background";
const DESCRIPTION_PANEL_STORAGE_KEY = "xhs-notion-console-description-panel";
const MAX_BACKGROUND_BYTES = 4 * 1024 * 1024;
const MAX_ALBUM_DESCRIPTION_LENGTH = 2000;
const TAG_COLOR_COUNT = 9;
const DESCRIPTION_DOCK_MEDIA = "(min-width: 1880px)";
const ALBUM_DOMAINS = [
  {
    name: "🛠️ 硬核技术与职业效能",
    icon: "🛠️",
    label: "硬核技术",
  },
  {
    name: "📸 视觉叙事与影像实验室",
    icon: "📸",
    label: "视觉影像",
  },
  {
    name: "🦾 生活百科与生存技能",
    icon: "🦾",
    label: "生活技能",
  },
  {
    name: "🌿 身心重塑与自我管理",
    icon: "🌿",
    label: "身心管理",
  },
  {
    name: "📍 地理图志与探店计划",
    icon: "📍",
    label: "地理探店",
  },
  {
    name: "🎭 奇趣碎片与小众文化",
    icon: "🎭",
    label: "奇趣文化",
  },
];
const DESCRIPTION_SECTIONS = [
  { key: "include", marker: "【收录什么】" },
  { key: "exclude", marker: "【排除什么】" },
  { key: "difference", marker: "【与相近专辑的区别】" },
];

function parseAlbumDescription(description) {
  const text = String(description || "").trim();
  const result = { include: "", exclude: "", difference: "" };
  if (!text) return result;

  const markers = DESCRIPTION_SECTIONS
    .map((section) => ({
      ...section,
      index: text.indexOf(section.marker),
    }))
    .filter((section) => section.index >= 0)
    .sort((first, second) => first.index - second.index);

  if (!markers.length) {
    result.include = text;
    return result;
  }

  markers.forEach((section, index) => {
    const contentStart = section.index + section.marker.length;
    const contentEnd = markers[index + 1]?.index ?? text.length;
    result[section.key] = text.slice(contentStart, contentEnd).trim();
  });
  const leadingText = text.slice(0, markers[0].index).trim();
  if (leadingText) {
    result.include = [leadingText, result.include].filter(Boolean).join("\n");
  }
  return result;
}

function composeAlbumDescription(parts) {
  return DESCRIPTION_SECTIONS
    .map((section) => {
      const content = String(parts?.[section.key] || "").trim();
      return content ? `${section.marker}\n${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

const el = {
  resultMeta: document.querySelector("#resultMeta"),
  refreshButton: document.querySelector("#refreshButton"),
  backgroundInput: document.querySelector("#backgroundInput"),
  backgroundButton: document.querySelector("#backgroundButton"),
  clearBackgroundButton: document.querySelector("#clearBackgroundButton"),
  searchButton: document.querySelector("#searchButton"),
  bulkPanel: document.querySelector("#bulkPanel"),
  selectAllButton: document.querySelector("#selectAllButton"),
  clearSelectionButton: document.querySelector("#clearSelectionButton"),
  aiClassifyButton: document.querySelector("#aiClassifyButton"),
  batchStatusSelect: document.querySelector("#batchStatusSelect"),
  batchStatusButton: document.querySelector("#batchStatusButton"),
  repairCoverButton: document.querySelector("#repairCoverButton"),
  cleanTagsButton: document.querySelector("#cleanTagsButton"),
  mergeDuplicatesButton: document.querySelector("#mergeDuplicatesButton"),
  albumActionButtons: Array.from(document.querySelectorAll(".album-action-button")),
  selectedCount: document.querySelector("#selectedCount"),
  message: document.querySelector("#message"),
  notesGrid: document.querySelector("#notesGrid"),
  emptyState: document.querySelector("#emptyState"),
  loadMoreStatus: document.querySelector("#loadMoreStatus"),
  loadMoreSentinel: document.querySelector("#loadMoreSentinel"),
  searchInput: document.querySelector("#searchInput"),
  titleInput: document.querySelector("#titleInput"),
  authorInput: document.querySelector("#authorInput"),
  tagInput: document.querySelector("#tagInput"),
  statusSelect: document.querySelector("#statusSelect"),
  albumFilterSelect: document.querySelector("#albumFilterSelect"),
  targetAlbumSelect: document.querySelector("#targetAlbumSelect"),
  createAlbumButton: document.querySelector("#createAlbumButton"),
  renameAlbumButton: document.querySelector("#renameAlbumButton"),
  albumEditorBackdrop: document.querySelector("#albumEditorBackdrop"),
  albumEditorModal: document.querySelector("#albumEditorModal"),
  albumEditorClose: document.querySelector("#albumEditorClose"),
  albumEditorForm: document.querySelector("#albumEditorForm"),
  albumEditorTitle: document.querySelector("#albumEditorTitle"),
  albumEditorSubtitle: document.querySelector("#albumEditorSubtitle"),
  albumNameInput: document.querySelector("#albumNameInput"),
  albumNameHint: document.querySelector("#albumNameHint"),
  albumDomainField: document.querySelector("#albumDomainField"),
  albumDomainSelect: document.querySelector("#albumDomainSelect"),
  albumEditorNotice: document.querySelector("#albumEditorNotice"),
  albumEditorCancel: document.querySelector("#albumEditorCancel"),
  albumEditorSubmit: document.querySelector("#albumEditorSubmit"),
  albumDescriptionPanel: document.querySelector("#albumDescriptionPanel"),
  albumDescriptionToggle: document.querySelector("#albumDescriptionToggle"),
  albumDescriptionClose: document.querySelector("#albumDescriptionClose"),
  descriptionPanelBackdrop: document.querySelector("#descriptionPanelBackdrop"),
  descriptionCompleteCount: document.querySelector("#descriptionCompleteCount"),
  descriptionTotalCount: document.querySelector("#descriptionTotalCount"),
  descriptionTriggerCount: document.querySelector("#descriptionTriggerCount"),
  descriptionDomainFilters: document.querySelector("#descriptionDomainFilters"),
  descriptionDomainAll: document.querySelector("#descriptionDomainAll"),
  descriptionDomainMeta: document.querySelector("#descriptionDomainMeta"),
  descriptionSearchInput: document.querySelector("#descriptionSearchInput"),
  descriptionAlbumList: document.querySelector("#descriptionAlbumList"),
  descriptionListEmpty: document.querySelector("#descriptionListEmpty"),
  descriptionAlbumName: document.querySelector("#descriptionAlbumName"),
  descriptionAlbumDomain: document.querySelector("#descriptionAlbumDomain"),
  descriptionSaveState: document.querySelector("#descriptionSaveState"),
  descriptionIncludeTextarea: document.querySelector("#descriptionIncludeTextarea"),
  descriptionExcludeTextarea: document.querySelector("#descriptionExcludeTextarea"),
  descriptionDifferenceTextarea: document.querySelector("#descriptionDifferenceTextarea"),
  descriptionSectionProgress: document.querySelector("#descriptionSectionProgress"),
  descriptionHint: document.querySelector(".description-hint"),
  descriptionCharacterCount: document.querySelector("#descriptionCharacterCount"),
  clearDescriptionButton: document.querySelector("#clearDescriptionButton"),
  saveDescriptionButton: document.querySelector("#saveDescriptionButton"),
};

function ensureContextMenu() {
  if (el.contextMenu) return el.contextMenu;

  const menu = document.createElement("div");
  menu.className = "note-context-menu is-hidden";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <div class="note-context-title"></div>
    <button class="note-context-action is-danger" type="button" role="menuitem">删除该篇笔记</button>
  `;
  document.body.appendChild(menu);

  el.contextMenu = menu;
  el.contextTitle = menu.querySelector(".note-context-title");
  el.deleteNoteButton = menu.querySelector(".note-context-action");
  el.deleteNoteButton.addEventListener("click", deleteContextNote);
  return menu;
}

function setMessage(text, type = "") {
  el.message.textContent = text || "";
  el.message.className = `message${type ? ` is-${type}` : ""}`;
}

function getNoteById(pageId) {
  return state.notes.find((note) => note.id === pageId);
}

function hideContextMenu() {
  state.contextNoteId = "";
  if (el.contextMenu) el.contextMenu.classList.add("is-hidden");
}

function showContextMenu(pageId, x, y) {
  const note = getNoteById(pageId);
  if (!note) return;

  const menu = ensureContextMenu();
  state.contextNoteId = pageId;
  el.contextTitle.textContent = note.title || "未命名笔记";
  menu.classList.remove("is-hidden");

  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - margin);
  const top = Math.min(y, window.innerHeight - rect.height - margin);
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
}

function applyBackground(dataUrl) {
  if (!dataUrl) {
    document.documentElement.style.removeProperty("--custom-bg-image");
    document.body.classList.remove("has-custom-bg");
    return;
  }
  document.documentElement.style.setProperty("--custom-bg-image", `url("${dataUrl}")`);
  document.body.classList.add("has-custom-bg");
}

function loadSavedBackground() {
  const saved = localStorage.getItem(BACKGROUND_STORAGE_KEY);
  if (saved) applyBackground(saved);
}

function handleBackgroundUpload(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setMessage("请选择图片文件。", "error");
    return;
  }
  if (file.size > MAX_BACKGROUND_BYTES) {
    setMessage("背景图片不能超过 4MB。", "error");
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const dataUrl = String(reader.result || "");
    try {
      localStorage.setItem(BACKGROUND_STORAGE_KEY, dataUrl);
      applyBackground(dataUrl);
      setMessage("背景已更新，仅保存在当前浏览器。", "success");
    } catch (error) {
      applyBackground(dataUrl);
      setMessage("背景已临时应用，但浏览器本地存储空间不足，刷新后可能失效。", "error");
    }
  });
  reader.addEventListener("error", () => {
    setMessage("读取图片失败，请换一张图片重试。", "error");
  });
  reader.readAsDataURL(file);
}

function clearBackground() {
  localStorage.removeItem(BACKGROUND_STORAGE_KEY);
  applyBackground("");
  if (el.backgroundInput) el.backgroundInput.value = "";
  setMessage("背景已清除。", "success");
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || `请求失败：${response.status}`);
  }
  return data;
}

function populateAlbumSelects() {
  const previousFilter = el.albumFilterSelect.value;
  const previousTarget = el.targetAlbumSelect.value;
  const filterOptions = ['<option value="">全部</option>'];
  const targetOptions = ['<option value="">选择目标专辑</option>'];

  for (const album of state.albums) {
    const safeName = escapeHtml(album.name);
    const safeId = escapeAttr(album.id || album.name);
    filterOptions.push(`<option value="${safeId}">${safeName}</option>`);
    targetOptions.push(`<option value="${safeId}">${safeName}</option>`);
  }

  el.albumFilterSelect.innerHTML = filterOptions.join("");
  el.targetAlbumSelect.innerHTML = targetOptions.join("");
  if (
    Array.from(el.albumFilterSelect.options).some(
      (option) => option.value === previousFilter
    )
  ) {
    el.albumFilterSelect.value = previousFilter;
  }
  if (
    Array.from(el.targetAlbumSelect.options).some(
      (option) => option.value === previousTarget
    )
  ) {
    el.targetAlbumSelect.value = previousTarget;
  }
}

function filterValue(value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue || cleanValue === "选择目标专辑" || cleanValue === "全部") {
    return "";
  }
  return cleanValue;
}

function queryParams({ cursor = "" } = {}) {
  const params = new URLSearchParams();
  const fields = [
    ["q", el.searchInput.value],
    ["title", el.titleInput.value],
    ["author", el.authorInput.value],
    ["tag", el.tagInput.value],
    ["status", el.statusSelect.value],
    ["album", el.albumFilterSelect.value],
  ];

  for (const [key, value] of fields) {
    const cleanValue = filterValue(value);
    if (cleanValue) params.set(key, cleanValue);
  }
  params.set("limit", "100");
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

async function loadAlbums() {
  const data = await requestJson("/api/albums");
  state.albums = data.albums || [];
  populateAlbumSelects();
}

function getSelectedTargetAlbum() {
  const selectedValue = filterValue(el.targetAlbumSelect.value);
  if (!selectedValue) return null;
  return (
    state.albums.find(
      (album) => album.id === selectedValue || album.name === selectedValue
    ) || null
  );
}

function setAlbumEditorOpen(isOpen) {
  el.albumEditorModal.classList.toggle("is-open", isOpen);
  el.albumEditorModal.setAttribute("aria-hidden", String(!isOpen));
  el.albumEditorBackdrop.classList.toggle("is-visible", isOpen);
  document.body.classList.toggle("album-editor-open", isOpen);
  if (isOpen) {
    window.requestAnimationFrame(() => {
      el.albumNameInput.focus();
      el.albumNameInput.select();
    });
  }
}

function openAlbumEditor(mode) {
  const targetAlbum = getSelectedTargetAlbum();
  if (mode === "rename" && !targetAlbum) {
    setMessage("请先选择要重命名的专辑。", "error");
    return;
  }

  state.albumEditorMode = mode;
  state.albumEditorTargetId = targetAlbum?.id || "";
  const isCreate = mode === "create";
  el.albumEditorTitle.textContent = isCreate ? "创建新专辑" : "更改专辑名称";
  el.albumEditorSubtitle.textContent = isCreate
    ? "新专辑会直接写入 Notion 专辑库。"
    : `正在重命名「${targetAlbum.name}」。`;
  el.albumNameInput.value = isCreate ? "" : targetAlbum.name;
  el.albumNameHint.textContent = isCreate
    ? "名称会同时显示在 Notion 和管理台中。"
    : "重命名不会改变现有笔记关联和 AI 专辑说明。";
  el.albumDomainField.classList.toggle("is-hidden", !isCreate);
  el.albumDomainSelect.required = isCreate;
  el.albumDomainSelect.value = isCreate
    ? (ALBUM_DOMAINS.some((domain) => domain.name === state.descriptionDomain)
        ? state.descriptionDomain
        : "")
    : targetAlbum.domain || "";
  el.albumEditorNotice.textContent = isCreate
    ? "创建后可立即用于批量追加、移动和 AI 分类。"
    : "所有关联笔记会继续指向同一个专辑，仅显示名称发生变化。";
  el.albumEditorSubmit.textContent = isCreate ? "创建专辑" : "保存新名称";
  setAlbumEditorOpen(true);
}

function closeAlbumEditor({ force = false } = {}) {
  if (state.albumEditorBusy && !force) return;
  setAlbumEditorOpen(false);
  state.albumEditorTargetId = "";
}

function setAlbumEditorBusy(isBusy) {
  state.albumEditorBusy = isBusy;
  el.albumEditorModal.classList.toggle("is-busy", isBusy);
  el.albumEditorModal.setAttribute("aria-busy", String(isBusy));
  el.albumNameInput.disabled = isBusy;
  el.albumDomainSelect.disabled = isBusy;
  el.albumEditorClose.disabled = isBusy;
  el.albumEditorCancel.disabled = isBusy;
  el.albumEditorSubmit.disabled = isBusy;
  if (isBusy) {
    el.albumEditorSubmit.dataset.idleLabel = el.albumEditorSubmit.textContent;
    el.albumEditorSubmit.textContent =
      state.albumEditorMode === "create" ? "正在创建..." : "正在保存...";
  } else {
    el.albumEditorSubmit.textContent =
      el.albumEditorSubmit.dataset.idleLabel ||
      (state.albumEditorMode === "create" ? "创建专辑" : "保存新名称");
  }
  updateSelection();
}

async function submitAlbumEditor(event) {
  event.preventDefault();
  if (state.albumEditorBusy) return;
  const albumName = el.albumNameInput.value.trim();
  if (!albumName) {
    el.albumNameInput.focus();
    return;
  }
  const isCreate = state.albumEditorMode === "create";
  const domain = el.albumDomainSelect.value;
  if (isCreate && !domain) {
    el.albumDomainSelect.focus();
    return;
  }

  setAlbumEditorBusy(true);
  try {
    const data = await requestJson("/api/albums", {
      method: "POST",
      body: JSON.stringify(
        isCreate
          ? { action: "create", album_name: albumName, domain }
          : {
              action: "rename",
              album_name: state.albumEditorTargetId,
              new_name: albumName,
            }
      ),
    });
    if (
      !isCreate &&
      state.activeDescriptionAlbum === data.old_name
    ) {
      state.activeDescriptionAlbum = data.album.name;
    }
    await loadAlbums();
    el.targetAlbumSelect.value = data.album.id;
    await loadAlbumDescriptions();
    if (!isCreate) await loadNotes();
    closeAlbumEditor({ force: true });
    updateSelection();
    setMessage(data.message, "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setAlbumEditorBusy(false);
  }
}

function getActiveAlbumDescription() {
  return state.albumDescriptions.find(
    (album) => album.name === state.activeDescriptionAlbum
  );
}

function setDescriptionPanelOpen(isOpen, { persist = true } = {}) {
  state.descriptionPanelOpen = Boolean(isOpen);
  const isDocked = window.matchMedia(DESCRIPTION_DOCK_MEDIA).matches;
  el.albumDescriptionPanel.classList.toggle("is-open", state.descriptionPanelOpen);
  el.albumDescriptionPanel.setAttribute(
    "aria-hidden",
    String(!state.descriptionPanelOpen)
  );
  el.albumDescriptionToggle.classList.toggle(
    "is-hidden",
    state.descriptionPanelOpen
  );
  el.albumDescriptionToggle.setAttribute(
    "aria-expanded",
    String(state.descriptionPanelOpen)
  );
  el.descriptionPanelBackdrop.classList.toggle(
    "is-visible",
    state.descriptionPanelOpen && !isDocked
  );
  document.body.classList.toggle(
    "description-panel-overlay-open",
    state.descriptionPanelOpen && !isDocked
  );
  if (persist) {
    try {
      localStorage.setItem(
        DESCRIPTION_PANEL_STORAGE_KEY,
        state.descriptionPanelOpen ? "open" : "closed"
      );
    } catch (error) {
      // Panel state is a convenience only; storage failures should not block editing.
    }
  }
}

function restoreDescriptionPanelState() {
  let saved = "";
  try {
    saved = localStorage.getItem(DESCRIPTION_PANEL_STORAGE_KEY) || "";
  } catch (error) {
    saved = "";
  }
  const defaultOpen = window.matchMedia(DESCRIPTION_DOCK_MEDIA).matches;
  setDescriptionPanelOpen(
    saved ? saved === "open" : defaultOpen,
    { persist: false }
  );
}

function getFilteredDescriptionAlbums() {
  const query = String(el.descriptionSearchInput.value || "").trim().toLowerCase();
  return state.albumDescriptions.filter((album) => {
    const matchesDomain =
      !state.descriptionDomain || album.domain === state.descriptionDomain;
    if (!matchesDomain) return false;
    if (!query) return true;
    return `${album.name} ${album.description || ""}`.toLowerCase().includes(query);
  });
}

function renderAlbumDomainFilters() {
  const counts = new Map(
    ALBUM_DOMAINS.map((domain) => [
      domain.name,
      state.albumDescriptions.filter((album) => album.domain === domain.name).length,
    ])
  );
  el.descriptionDomainFilters.innerHTML = ALBUM_DOMAINS.map((domain) => {
    const isActive = state.descriptionDomain === domain.name;
    return `
      <button
        class="description-domain-button${isActive ? " is-active" : ""}"
        type="button"
        data-domain="${escapeAttr(domain.name)}"
        title="${escapeAttr(domain.name)}"
        aria-pressed="${isActive}"
      >
        <span class="description-domain-icon" aria-hidden="true">${domain.icon}</span>
        <span class="description-domain-name">${domain.label}</span>
        <span class="description-domain-count">${counts.get(domain.name) || 0}</span>
      </button>
    `;
  }).join("");
  el.descriptionDomainAll.classList.toggle(
    "is-active",
    state.descriptionDomain === ""
  );
  el.descriptionDomainAll.setAttribute(
    "aria-pressed",
    String(state.descriptionDomain === "")
  );
  const activeDomain = ALBUM_DOMAINS.find(
    (domain) => domain.name === state.descriptionDomain
  );
  el.descriptionDomainMeta.textContent = activeDomain
    ? `${activeDomain.label} · ${counts.get(activeDomain.name) || 0} 个专辑`
    : `全部主题 · ${state.albumDescriptions.length} 个专辑`;
}

function renderAlbumDescriptionList() {
  const filteredAlbums = getFilteredDescriptionAlbums();
  const completedCount = state.albumDescriptions.filter(
    (album) => Boolean(album.description)
  ).length;

  el.descriptionCompleteCount.textContent = completedCount;
  el.descriptionTotalCount.textContent = state.albumDescriptions.length;
  el.descriptionTriggerCount.textContent =
    `${completedCount}/${state.albumDescriptions.length}`;
  renderAlbumDomainFilters();
  el.descriptionListEmpty.classList.toggle("is-visible", filteredAlbums.length === 0);
  el.descriptionAlbumList.innerHTML = filteredAlbums
    .map((album) => {
      const isActive = album.name === state.activeDescriptionAlbum;
      const parts = parseAlbumDescription(album.description);
      const description =
        parts.include ||
        parts.exclude ||
        parts.difference ||
        "还没有填写 AI 语义说明";
      return `
        <button
          class="description-album-item${isActive ? " is-active" : ""}${album.description ? " has-description" : ""}"
          type="button"
          role="option"
          aria-selected="${isActive}"
          data-album-name="${escapeAttr(album.name)}"
        >
          <span class="description-album-status" aria-hidden="true"></span>
          <span class="description-album-copy">
            <strong>${escapeHtml(album.name)}</strong>
            <small>${escapeHtml(description)}</small>
          </span>
        </button>
      `;
    })
    .join("");
}

function getDescriptionPartsFromEditor() {
  return {
    include: el.descriptionIncludeTextarea.value,
    exclude: el.descriptionExcludeTextarea.value,
    difference: el.descriptionDifferenceTextarea.value,
  };
}

function getDescriptionTextareas() {
  return [
    el.descriptionIncludeTextarea,
    el.descriptionExcludeTextarea,
    el.descriptionDifferenceTextarea,
  ];
}

function updateDescriptionMetrics(parts = getDescriptionPartsFromEditor()) {
  const description = composeAlbumDescription(parts);
  const completedSections = Object.values(parts).filter((value) =>
    Boolean(String(value || "").trim())
  ).length;
  const isOverLimit = description.length > MAX_ALBUM_DESCRIPTION_LENGTH;
  el.descriptionSectionProgress.textContent = `已填写 ${completedSections}/3 项`;
  el.descriptionCharacterCount.textContent = description.length;
  el.descriptionHint.classList.toggle("is-over-limit", isOverLimit);
  return { description, completedSections, isOverLimit };
}

function updateDescriptionEditor() {
  const album = getActiveAlbumDescription();
  const hasAlbum = Boolean(album);
  const savedDescription = album?.description || "";
  const parts = parseAlbumDescription(savedDescription);
  el.descriptionAlbumName.textContent = album?.name || "请选择专辑";
  el.descriptionAlbumDomain.textContent = album?.domain || "";
  el.descriptionIncludeTextarea.value = parts.include;
  el.descriptionExcludeTextarea.value = parts.exclude;
  el.descriptionDifferenceTextarea.value = parts.difference;
  getDescriptionTextareas().forEach((textarea) => {
    textarea.disabled = !hasAlbum || state.descriptionBusy;
  });
  updateDescriptionMetrics(parts);
  el.descriptionSaveState.textContent = savedDescription ? "已保存" : "尚未填写";
  el.descriptionSaveState.classList.toggle("is-saved", Boolean(savedDescription));
  el.descriptionSaveState.classList.remove("is-dirty");
  el.saveDescriptionButton.disabled = true;
  el.clearDescriptionButton.disabled =
    !hasAlbum || !savedDescription || state.descriptionBusy;
}

function selectDescriptionDomain(domainName) {
  const cleanDomain = String(domainName || "");
  if (
    cleanDomain &&
    !ALBUM_DOMAINS.some((domain) => domain.name === cleanDomain)
  ) {
    return;
  }
  state.descriptionDomain = cleanDomain;
  el.descriptionSearchInput.value = "";
  const firstMatch = state.albumDescriptions.find(
    (album) => !cleanDomain || album.domain === cleanDomain
  );
  if (
    !getActiveAlbumDescription() ||
    (cleanDomain && getActiveAlbumDescription()?.domain !== cleanDomain)
  ) {
    state.activeDescriptionAlbum = firstMatch?.name || "";
  }
  renderAlbumDescriptionList();
  updateDescriptionEditor();
}

function selectDescriptionAlbum(albumName) {
  if (!state.albumDescriptions.some((album) => album.name === albumName)) return;
  state.activeDescriptionAlbum = albumName;
  renderAlbumDescriptionList();
  updateDescriptionEditor();
}

function handleDescriptionDraft() {
  const album = getActiveAlbumDescription();
  const metrics = updateDescriptionMetrics();
  const normalizedSavedDescription = composeAlbumDescription(
    parseAlbumDescription(album?.description || "")
  );
  const isDirty =
    Boolean(album) && metrics.description !== normalizedSavedDescription;
  el.descriptionSaveState.textContent = isDirty
    ? metrics.isOverLimit
      ? "内容超过上限"
      : "有未保存修改"
    : normalizedSavedDescription
      ? "已保存"
      : "尚未填写";
  el.descriptionSaveState.classList.toggle("is-dirty", isDirty);
  el.descriptionSaveState.classList.toggle(
    "is-saved",
    !isDirty && Boolean(normalizedSavedDescription)
  );
  el.saveDescriptionButton.disabled =
    state.descriptionBusy ||
    !isDirty ||
    !metrics.description ||
    metrics.isOverLimit;
}

function setDescriptionBusy(isBusy) {
  state.descriptionBusy = isBusy;
  el.albumDescriptionPanel.setAttribute("aria-busy", String(isBusy));
  getDescriptionTextareas().forEach((textarea) => {
    textarea.disabled = isBusy || !getActiveAlbumDescription();
  });
  if (isBusy) {
    el.saveDescriptionButton.disabled = true;
    el.clearDescriptionButton.disabled = true;
  } else {
    handleDescriptionDraft();
    el.clearDescriptionButton.disabled = !getActiveAlbumDescription()?.description;
  }
}

function applySavedAlbumDescription(updatedAlbum) {
  const index = state.albumDescriptions.findIndex(
    (album) => album.name === updatedAlbum.name
  );
  if (index >= 0) {
    state.albumDescriptions[index] = {
      ...state.albumDescriptions[index],
      ...updatedAlbum,
    };
  }
  renderAlbumDescriptionList();
  updateDescriptionEditor();
}

async function saveAlbumDescription({ clear = false } = {}) {
  const album = getActiveAlbumDescription();
  if (!album || state.descriptionBusy) return;
  const description = clear
    ? ""
    : composeAlbumDescription(getDescriptionPartsFromEditor());
  if (!clear && !description) {
    setMessage("专辑说明不能为空；如需删除现有说明，请使用“清空说明”。", "error");
    return;
  }
  if (description.length > MAX_ALBUM_DESCRIPTION_LENGTH) {
    setMessage(
      `专辑说明合计不能超过 ${MAX_ALBUM_DESCRIPTION_LENGTH} 个字符。`,
      "error"
    );
    return;
  }
  if (
    clear &&
    !window.confirm(
      `确定清空「${album.name}」的 AI 专辑说明吗？\n\n清空后，AI 分类将不再获得该专辑的语义参考。`
    )
  ) {
    return;
  }

  setDescriptionBusy(true);
  el.descriptionSaveState.textContent = clear ? "正在清空..." : "正在保存...";
  try {
    const data = await requestJson("/api/album-descriptions", {
      method: "POST",
      body: JSON.stringify({
        album_name: album.name,
        description,
      }),
    });
    applySavedAlbumDescription(data.album);
    setMessage(data.message || "AI 专辑说明已更新。", "success");
  } catch (error) {
    setMessage(error.message, "error");
    el.descriptionSaveState.textContent = "保存失败";
    el.descriptionSaveState.classList.add("is-dirty");
  } finally {
    setDescriptionBusy(false);
  }
}

async function loadAlbumDescriptions() {
  const data = await requestJson("/api/album-descriptions");
  state.albumDescriptions = data.albums || [];
  const activeStillExists = state.albumDescriptions.some(
    (album) => album.name === state.activeDescriptionAlbum
  );
  if (!activeStillExists) {
    state.activeDescriptionAlbum =
      state.albumDescriptions.find((album) => !album.description)?.name ||
      state.albumDescriptions[0]?.name ||
      "";
  }
  if (state.descriptionDomain === null) {
    state.descriptionDomain = getActiveAlbumDescription()?.domain || "";
  }
  renderAlbumDescriptionList();
  updateDescriptionEditor();
}

function updateResultMeta() {
  const moreText = state.hasMore ? "，下滑继续加载更多" : "";
  el.resultMeta.textContent = `显示 ${state.notes.length} 篇，扫描 ${state.scanned} 条${moreText}`;
  if (!el.loadMoreStatus) return;
  if (state.loading && state.nextCursor) {
    el.loadMoreStatus.textContent = "正在加载更多...";
  } else if (state.hasMore) {
    el.loadMoreStatus.textContent = "下滑继续加载更多";
  } else if (state.notes.length > 0) {
    el.loadMoreStatus.textContent = "已加载当前条件下的全部结果";
  } else {
    el.loadMoreStatus.textContent = "";
  }
}

async function loadNotes({ append = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  let failed = false;
  if (!append) {
    state.nextCursor = "";
    state.hasMore = false;
    state.scanned = 0;
    el.searchButton.disabled = true;
    el.refreshButton.disabled = true;
    el.resultMeta.textContent = "正在查询...";
    if (el.loadMoreStatus) el.loadMoreStatus.textContent = "";
    setMessage("");
  } else {
    updateResultMeta();
  }

  try {
    const data = await requestJson(`/api/notes?${queryParams({ cursor: append ? state.nextCursor : "" })}`);
    const incomingNotes = data.notes || [];
    if (append) {
      const existingIds = new Set(state.notes.map((note) => note.id));
      state.notes = state.notes.concat(incomingNotes.filter((note) => !existingIds.has(note.id)));
    } else {
      state.notes = incomingNotes;
      state.selectedIds.clear();
    }
    state.nextCursor = data.next_cursor || "";
    state.hasMore = Boolean(data.has_more && state.nextCursor);
    state.scanned += data.scanned || 0;
    renderNotes();
    updateSelection();
    updateResultMeta();
  } catch (error) {
    failed = true;
    if (!append) {
      state.notes = [];
      state.nextCursor = "";
      state.hasMore = false;
      state.scanned = 0;
      renderNotes();
      el.resultMeta.textContent = "查询失败";
    } else if (el.loadMoreStatus) {
      el.loadMoreStatus.textContent = "加载更多失败，请稍后再试";
    }
    setMessage(error.message, "error");
  } finally {
    state.loading = false;
    if (!append) {
      el.searchButton.disabled = false;
      el.refreshButton.disabled = false;
    }
    if (!failed) {
      updateResultMeta();
      scheduleLoadMoreIfNearBottom();
    }
  }
}

function loadMoreNotes() {
  if (state.loading || !state.hasMore || !state.nextCursor) return;
  loadNotes({ append: true });
}

function scheduleLoadMoreIfNearBottom() {
  if (!el.loadMoreSentinel || !state.hasMore) return;
  window.requestAnimationFrame(() => {
    const rect = el.loadMoreSentinel.getBoundingClientRect();
    if (rect.top <= window.innerHeight + 900) {
      loadMoreNotes();
    }
  });
}

function renderNotes() {
  el.notesGrid.innerHTML = state.notes.map(renderCard).join("");
  el.emptyState.classList.toggle("is-visible", state.notes.length === 0);

  el.notesGrid.querySelectorAll(".card").forEach((cardEl) => {
    const pageId = cardEl.dataset.pageId;
    const checkbox = cardEl.querySelector(".check");
    if (!checkbox) return;
    checkbox.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleSelection(pageId, cardEl, checkbox);
    });
    cardEl.querySelector(".cover")?.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showContextMenu(pageId, event.clientX, event.clientY);
    });
    cardEl.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    });
    cardEl.querySelector(".author-copy")?.addEventListener("click", (event) => {
      event.stopPropagation();
      copyAuthorName(event.currentTarget);
    });
    cardEl.addEventListener("click", () => {
      hideContextMenu();
      toggleSelection(pageId, cardEl, checkbox);
    });
  });
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Fall back for embedded pages that deny the Clipboard API.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied =
    typeof document.execCommand === "function" && document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("浏览器未允许复制");
}

async function copyAuthorName(button) {
  const author = String(button.dataset.author || "").trim();
  if (!author) return;
  const copyState = button.querySelector(".author-copy-state");
  try {
    await writeClipboardText(author);
    button.classList.add("is-copied");
    if (copyState) copyState.textContent = "已复制";
    setMessage(`已复制作者名：${author}`, "success");
    window.setTimeout(() => {
      button.classList.remove("is-copied");
      if (copyState) copyState.textContent = "复制";
    }, 1600);
  } catch (error) {
    setMessage(`复制作者名失败：${error.message}`, "error");
  }
}

function toggleSelection(pageId, cardEl, checkbox) {
  if (!pageId) return;
  if (state.selectedIds.has(pageId)) {
    state.selectedIds.delete(pageId);
    cardEl.classList.remove("is-selected");
    checkbox.checked = false;
  } else {
    state.selectedIds.add(pageId);
    cardEl.classList.add("is-selected");
    checkbox.checked = true;
  }
  updateSelection();
}

function renderCard(note) {
  const title = note.title || "未命名笔记";
  const sourceUrl = note.url || "";
  const notionUrl = note.notion_url || "#";
  const cover = note.cover || "";
  const isSelected = state.selectedIds.has(note.id);
  const status = note.status || "";
  const statusClass = status ? "" : "is-empty";

  const tagChips = renderChips(splitTags(note.tags), "tag", { colorful: true });
  const albumChips = renderChips(note.albums || [], "tag is-album");

  const coverHtml = cover
    ? `<img class="cover-img" src="${escapeAttr(cover)}" referrerpolicy="no-referrer" loading="lazy" alt="" onerror="this.classList.add('is-failed')" />`
    : '<div class="cover-fallback">无封面</div>';

  return `
    <article class="card ${isSelected ? "is-selected" : ""}" data-page-id="${escapeHtml(note.id)}">
      <div class="cover">
        ${coverHtml}
        <input type="checkbox" class="check" ${isSelected ? "checked" : ""} aria-label="选择笔记" />
      </div>
      <div class="body">
        <div class="title">${escapeHtml(title)}</div>
        ${
          note.author
            ? `
              <button
                class="author-copy"
                type="button"
                data-author="${escapeAttr(note.author)}"
                title="点击复制作者名"
                aria-label="复制作者名 ${escapeAttr(note.author)}"
              >
                <span class="author-mark" aria-hidden="true">@</span>
                <span class="author-name">${escapeHtml(note.author)}</span>
                <span class="author-copy-state" aria-hidden="true">复制</span>
              </button>
            `
            : ""
        }
        ${tagChips}
        ${albumChips}
        <div class="foot">
          <span class="status ${statusClass}">${escapeHtml(status || "无状态")}</span>
          <span class="links">
            ${sourceUrl ? `<a class="source-link" href="${escapeAttr(sourceUrl)}" data-page-id="${escapeAttr(note.id)}" target="_blank" rel="noreferrer">原文</a>` : ""}
            <a href="${escapeAttr(notionUrl)}" target="_blank" rel="noreferrer">Notion</a>
          </span>
        </div>
      </div>
    </article>
  `;
}

function stableTagColorIndex(value) {
  let hash = 0;
  for (const character of String(value || "")) {
    hash = (hash * 31 + character.codePointAt(0)) | 0;
  }
  return Math.abs(hash) % TAG_COLOR_COUNT;
}

function renderChips(items, className = "tag", { colorful = false } = {}) {
  if (!items.length) return "";
  return `<div class="tag-list">${items
    .map((item) => {
      const colorClass = colorful
        ? ` is-color-${stableTagColorIndex(item)}`
        : "";
      return `<span class="${className}${colorClass}">${escapeHtml(item)}</span>`;
    })
    .join("")}</div>`;
}

function splitTags(tags) {
  if (!tags) return [];
  return tags
    .split(/[,\s，#]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function updateSelection() {
  const selectedCount = state.selectedIds.size;
  const hasSelection = selectedCount > 0;
  const hasAlbum = Boolean(filterValue(el.targetAlbumSelect.value));
  const hasStatus = Boolean(filterValue(el.batchStatusSelect.value));

  el.selectedCount.textContent = selectedCount;
  el.selectAllButton.disabled = state.batchBusy || state.notes.length === 0;
  el.clearSelectionButton.disabled = state.batchBusy || !hasSelection;
  el.targetAlbumSelect.disabled = state.batchBusy;
  el.batchStatusSelect.disabled = state.batchBusy;
  el.aiClassifyButton.disabled = state.batchBusy || !hasSelection;
  el.batchStatusButton.disabled = state.batchBusy || !hasSelection || !hasStatus;
  el.repairCoverButton.disabled = state.batchBusy || !hasSelection;
  el.cleanTagsButton.disabled = state.batchBusy || !hasSelection;
  el.mergeDuplicatesButton.disabled = state.batchBusy || selectedCount < 2;
  el.albumActionButtons.forEach((button) => {
    button.disabled = state.batchBusy || !hasSelection || !hasAlbum;
  });
  el.createAlbumButton.disabled = state.batchBusy || state.albumEditorBusy;
  el.renameAlbumButton.disabled =
    state.batchBusy || state.albumEditorBusy || !getSelectedTargetAlbum();
}

function handleTargetAlbumChange() {
  updateSelection();
}

function selectAllVisible() {
  state.notes.forEach((note) => state.selectedIds.add(note.id));
  renderNotes();
  updateSelection();
}

function clearSelection() {
  state.selectedIds.clear();
  renderNotes();
  updateSelection();
}

function setBatchBusy(button, isBusy, busyLabel = "处理中...") {
  state.batchBusy = isBusy;
  el.bulkPanel.setAttribute("aria-busy", String(isBusy));
  el.bulkPanel.classList.toggle("is-busy", isBusy);
  if (button) {
    if (isBusy) {
      button.dataset.idleLabel = button.textContent;
      button.textContent = busyLabel;
      button.classList.add("is-loading");
    } else {
      button.textContent = button.dataset.idleLabel || button.textContent;
      button.classList.remove("is-loading");
    }
  }
  updateSelection();
}

async function runBatchAction({
  action,
  button,
  payload = {},
  busyLabel = "处理中...",
  confirmText = "",
}) {
  const pageIds = Array.from(state.selectedIds);
  if (!pageIds.length || state.batchBusy) return;
  if (confirmText && !window.confirm(confirmText)) return;

  setBatchBusy(button, true, busyLabel);
  setMessage(`${busyLabel} 请保持页面打开。`);

  try {
    const data = await requestJson("/api/notes/batch", {
      method: "POST",
      body: JSON.stringify({
        action,
        page_ids: pageIds,
        ...payload,
      }),
    });
    const resultMessage = data.message || "批量操作已完成。";
    const resultType = data.failed ? "error" : "success";
    await loadNotes();
    setMessage(resultMessage, resultType);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    setBatchBusy(button, false);
  }
}

function runAlbumAction(event) {
  const button = event.currentTarget;
  const mode = button.dataset.albumMode;
  const albumName = filterValue(el.targetAlbumSelect.value);
  if (!albumName) return;

  const labels = {
    append: "追加专辑",
    move: "移动专辑",
    remove: "移除专辑",
  };
  let confirmText = "";
  if (mode === "move") {
    confirmText = `移动后会用目标专辑替换所选 ${state.selectedIds.size} 篇笔记的原有专辑，确定继续吗？`;
  } else if (mode === "remove") {
    confirmText = `确定从所选 ${state.selectedIds.size} 篇笔记中移除该专辑吗？`;
  }

  runBatchAction({
    action: "album",
    button,
    payload: { album_name: albumName, mode },
    busyLabel: `${labels[mode]}中...`,
    confirmText,
  });
}

function runAiClassification() {
  runBatchAction({
    action: "ai-classify",
    button: el.aiClassifyButton,
    busyLabel: "AI 分类中...",
    confirmText: `AI 会重新分析并替换所选 ${state.selectedIds.size} 篇笔记的当前专辑，确定继续吗？`,
  });
}

function runStatusUpdate() {
  const status = filterValue(el.batchStatusSelect.value);
  if (!status) return;
  runBatchAction({
    action: "status",
    button: el.batchStatusButton,
    payload: { status },
    busyLabel: "修改状态中...",
  });
}

function runCoverRepair() {
  runBatchAction({
    action: "repair-cover",
    button: el.repairCoverButton,
    busyLabel: "修复封面中...",
  });
}

function runTagCleanup() {
  runBatchAction({
    action: "clean-tags",
    button: el.cleanTagsButton,
    busyLabel: "清理标签中...",
  });
}

function runDuplicateMerge() {
  runBatchAction({
    action: "merge-duplicates",
    button: el.mergeDuplicatesButton,
    busyLabel: "合并重复项中...",
    confirmText:
      `将检查所选 ${state.selectedIds.size} 篇笔记。重复项的标签和专辑会先合并，` +
      "随后移入 Notion 回收站；该操作不可在管理台内撤销。确定继续吗？",
  });
}

async function deleteContextNote() {
  const pageId = state.contextNoteId;
  const note = getNoteById(pageId);
  if (!pageId || !note) {
    hideContextMenu();
    return;
  }

  const title = note.title || "未命名笔记";
  if (!window.confirm(`确定要删除《${title}》吗？\n\n该操作会把这篇笔记移入 Notion 回收站。`)) {
    hideContextMenu();
    return;
  }

  hideContextMenu();
  setMessage("正在删除笔记...");

  try {
    const data = await requestJson("/api/notes/delete", {
      method: "POST",
      body: JSON.stringify({ page_id: pageId }),
    });
    state.selectedIds.delete(pageId);
    state.notes = state.notes.filter((item) => item.id !== pageId);
    renderNotes();
    updateSelection();
    updateResultMeta();
    setMessage(data.message || "笔记已移入 Notion 回收站。", "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
}

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

function truncate(value, length) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function bindEvents() {
  ensureContextMenu();
  el.searchButton.addEventListener("click", loadNotes);
  el.refreshButton.addEventListener("click", loadNotes);
  el.selectAllButton.addEventListener("click", selectAllVisible);
  el.clearSelectionButton.addEventListener("click", clearSelection);
  el.aiClassifyButton.addEventListener("click", runAiClassification);
  el.batchStatusButton.addEventListener("click", runStatusUpdate);
  el.repairCoverButton.addEventListener("click", runCoverRepair);
  el.cleanTagsButton.addEventListener("click", runTagCleanup);
  el.mergeDuplicatesButton.addEventListener("click", runDuplicateMerge);
  el.albumActionButtons.forEach((button) => {
    button.addEventListener("click", runAlbumAction);
  });
  el.createAlbumButton.addEventListener("click", () =>
    openAlbumEditor("create")
  );
  el.renameAlbumButton.addEventListener("click", () =>
    openAlbumEditor("rename")
  );
  el.albumEditorForm.addEventListener("submit", submitAlbumEditor);
  el.albumEditorClose.addEventListener("click", () => closeAlbumEditor());
  el.albumEditorCancel.addEventListener("click", () => closeAlbumEditor());
  el.albumEditorBackdrop.addEventListener("click", () => closeAlbumEditor());
  el.statusSelect.addEventListener("change", loadNotes);
  el.albumFilterSelect.addEventListener("change", loadNotes);
  el.targetAlbumSelect.addEventListener("change", handleTargetAlbumChange);
  el.batchStatusSelect.addEventListener("change", updateSelection);
  el.backgroundButton.addEventListener("click", () => el.backgroundInput.click());
  el.clearBackgroundButton.addEventListener("click", clearBackground);
  el.backgroundInput.addEventListener("change", () => {
    handleBackgroundUpload(el.backgroundInput.files?.[0]);
  });
  el.descriptionSearchInput.addEventListener("input", renderAlbumDescriptionList);
  el.albumDescriptionToggle.addEventListener("click", () =>
    setDescriptionPanelOpen(true)
  );
  el.albumDescriptionClose.addEventListener("click", () =>
    setDescriptionPanelOpen(false)
  );
  el.descriptionPanelBackdrop.addEventListener("click", () =>
    setDescriptionPanelOpen(false)
  );
  el.descriptionDomainAll.addEventListener("click", () =>
    selectDescriptionDomain("")
  );
  el.descriptionDomainFilters.addEventListener("click", (event) => {
    const button = event.target.closest(".description-domain-button");
    if (button) selectDescriptionDomain(button.dataset.domain);
  });
  el.descriptionAlbumList.addEventListener("click", (event) => {
    const button = event.target.closest(".description-album-item");
    if (button) selectDescriptionAlbum(button.dataset.albumName);
  });
  getDescriptionTextareas().forEach((textarea) => {
    textarea.addEventListener("input", handleDescriptionDraft);
  });
  el.saveDescriptionButton.addEventListener("click", () => saveAlbumDescription());
  el.clearDescriptionButton.addEventListener("click", () =>
    saveAlbumDescription({ clear: true })
  );

  for (const input of [el.searchInput, el.titleInput, el.authorInput, el.tagInput]) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") loadNotes();
    });
  }

  document.addEventListener("click", (event) => {
    if (!el.contextMenu || el.contextMenu.contains(event.target)) return;
    hideContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideContextMenu();
      if (el.albumEditorModal.classList.contains("is-open")) {
        closeAlbumEditor();
      } else if (state.descriptionPanelOpen) {
        setDescriptionPanelOpen(false);
      }
    }
  });
  window.addEventListener("blur", hideContextMenu);
  window.addEventListener("resize", () => {
    hideContextMenu();
    setDescriptionPanelOpen(state.descriptionPanelOpen, { persist: false });
  });
  window.addEventListener("scroll", hideContextMenu, true);

  if (el.loadMoreSentinel && "IntersectionObserver" in window) {
    const loadMoreObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreNotes();
        }
      },
      { root: null, rootMargin: "900px 0px", threshold: 0 }
    );
    loadMoreObserver.observe(el.loadMoreSentinel);
  } else {
    window.addEventListener("scroll", () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 900;
      if (nearBottom) loadMoreNotes();
    });
  }
}

async function init() {
  loadSavedBackground();
  bindEvents();
  restoreDescriptionPanelState();
  try {
    await loadAlbums();
    await loadAlbumDescriptions();
    await loadNotes();
  } catch (error) {
    el.resultMeta.textContent = "连接失败";
    setMessage(error.message, "error");
  }
}

init();
