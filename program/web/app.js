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
};

const BACKGROUND_STORAGE_KEY = "xhs-notion-console-background";
const MAX_BACKGROUND_BYTES = 4 * 1024 * 1024;

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
    cardEl.addEventListener("click", () => {
      hideContextMenu();
      toggleSelection(pageId, cardEl, checkbox);
    });
  });
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

  const tagChips = renderChips(splitTags(note.tags), "tag");
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
        ${note.author ? `<div class="author">${escapeHtml(note.author)}</div>` : ""}
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

function renderChips(items, className = "tag") {
  if (!items.length) return "";
  return `<div class="tag-list">${items
    .map((item) => `<span class="${className}">${escapeHtml(item)}</span>`)
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
  el.statusSelect.addEventListener("change", loadNotes);
  el.albumFilterSelect.addEventListener("change", loadNotes);
  el.targetAlbumSelect.addEventListener("change", handleTargetAlbumChange);
  el.batchStatusSelect.addEventListener("change", updateSelection);
  el.backgroundButton.addEventListener("click", () => el.backgroundInput.click());
  el.clearBackgroundButton.addEventListener("click", clearBackground);
  el.backgroundInput.addEventListener("change", () => {
    handleBackgroundUpload(el.backgroundInput.files?.[0]);
  });

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
    }
  });
  window.addEventListener("blur", hideContextMenu);
  window.addEventListener("resize", hideContextMenu);
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
  try {
    await loadAlbums();
    await loadNotes();
  } catch (error) {
    el.resultMeta.textContent = "连接失败";
    setMessage(error.message, "error");
  }
}

init();
