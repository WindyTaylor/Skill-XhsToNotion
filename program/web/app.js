const state = {
  albums: [],
  notes: [],
  selectedIds: new Set(),
  loading: false,
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
  addAlbumButton: document.querySelector("#addAlbumButton"),
  selectedCount: document.querySelector("#selectedCount"),
  message: document.querySelector("#message"),
  notesGrid: document.querySelector("#notesGrid"),
  emptyState: document.querySelector("#emptyState"),
  searchInput: document.querySelector("#searchInput"),
  titleInput: document.querySelector("#titleInput"),
  authorInput: document.querySelector("#authorInput"),
  tagInput: document.querySelector("#tagInput"),
  statusSelect: document.querySelector("#statusSelect"),
  albumFilterSelect: document.querySelector("#albumFilterSelect"),
  targetAlbumSelect: document.querySelector("#targetAlbumSelect"),
};

function setMessage(text, type = "") {
  el.message.textContent = text || "";
  el.message.className = `message${type ? ` is-${type}` : ""}`;
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
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || `请求失败：${response.status}`);
  }
  return data;
}

function populateAlbumSelects() {
  const filterOptions = ['<option value="">全部</option>'];
  const targetOptions = ['<option value="">选择目标专辑</option>'];

  for (const album of state.albums) {
    const safeName = escapeHtml(album.name);
    filterOptions.push(`<option value="${safeName}">${safeName}</option>`);
    targetOptions.push(`<option value="${safeName}">${safeName}</option>`);
  }

  el.albumFilterSelect.innerHTML = filterOptions.join("");
  el.targetAlbumSelect.innerHTML = targetOptions.join("");
}

function queryParams() {
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
    const cleanValue = value.trim();
    if (cleanValue) params.set(key, cleanValue);
  }
  params.set("limit", "100");
  return params.toString();
}

async function loadAlbums() {
  const data = await requestJson("/api/albums");
  state.albums = data.albums || [];
  populateAlbumSelects();
}

async function loadNotes() {
  if (state.loading) return;
  state.loading = true;
  el.searchButton.disabled = true;
  el.refreshButton.disabled = true;
  el.resultMeta.textContent = "正在查询...";
  setMessage("");

  try {
    const data = await requestJson(`/api/notes?${queryParams()}`);
    state.notes = data.notes || [];
    state.selectedIds.clear();
    renderNotes();
    updateSelection();
    const moreText = data.has_more ? "，还有更多结果可继续缩小条件" : "";
    el.resultMeta.textContent = `显示 ${state.notes.length} 篇，扫描 ${data.scanned || 0} 条${moreText}`;
  } catch (error) {
    state.notes = [];
    renderNotes();
    el.resultMeta.textContent = "查询失败";
    setMessage(error.message, "error");
  } finally {
    state.loading = false;
    el.searchButton.disabled = false;
    el.refreshButton.disabled = false;
  }
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
    cardEl.addEventListener("click", () => {
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
            ${sourceUrl ? `<a href="${escapeAttr(sourceUrl)}" target="_blank" rel="noreferrer">原文</a>` : ""}
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
  el.selectedCount.textContent = state.selectedIds.size;
  el.addAlbumButton.disabled =
    state.selectedIds.size === 0 || !el.targetAlbumSelect.value;
}

async function addSelectedToAlbum() {
  const albumName = el.targetAlbumSelect.value;
  if (!albumName || state.selectedIds.size === 0) return;

  el.addAlbumButton.disabled = true;
  setMessage("正在追加专辑...");

  try {
    const data = await requestJson("/api/notes/add-to-album", {
      method: "POST",
      body: JSON.stringify({
        page_ids: Array.from(state.selectedIds),
        album_name: albumName,
        mode: "append",
      }),
    });
    const resultMessage = data.message || "操作完成";
    const resultType = data.failed ? "error" : "success";
    await loadNotes();
    setMessage(resultMessage, resultType);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    updateSelection();
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
  el.searchButton.addEventListener("click", loadNotes);
  el.refreshButton.addEventListener("click", loadNotes);
  el.addAlbumButton.addEventListener("click", addSelectedToAlbum);
  el.targetAlbumSelect.addEventListener("change", updateSelection);
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
