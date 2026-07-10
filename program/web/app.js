const state = {
  albums: [],
  notes: [],
  selectedIds: new Set(),
  loading: false,
};

const el = {
  resultMeta: document.querySelector("#resultMeta"),
  refreshButton: document.querySelector("#refreshButton"),
  searchButton: document.querySelector("#searchButton"),
  addAlbumButton: document.querySelector("#addAlbumButton"),
  selectAllCheckbox: document.querySelector("#selectAllCheckbox"),
  selectedCount: document.querySelector("#selectedCount"),
  message: document.querySelector("#message"),
  notesBody: document.querySelector("#notesBody"),
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
  const targetOptions = ['<option value="">选择专辑</option>'];

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
  el.notesBody.innerHTML = state.notes.map(renderNoteRow).join("");
  el.emptyState.classList.toggle("is-visible", state.notes.length === 0);

  el.notesBody.querySelectorAll("input[data-page-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.selectedIds.add(checkbox.dataset.pageId);
      } else {
        state.selectedIds.delete(checkbox.dataset.pageId);
      }
      updateSelection();
    });
  });
}

function renderNoteRow(note) {
  const title = note.title || "未命名笔记";
  const notionUrl = note.notion_url || "#";
  const sourceUrl = note.url || "";
  const summary = truncate(note.summary || "", 110);
  const checked = state.selectedIds.has(note.id) ? "checked" : "";

  return `
    <tr>
      <td class="select-cell">
        <input type="checkbox" data-page-id="${escapeHtml(note.id)}" ${checked} aria-label="选择笔记" />
      </td>
      <td>
        <a class="note-title" href="${escapeHtml(notionUrl)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>
        ${summary ? `<div class="summary">${escapeHtml(summary)}</div>` : ""}
      </td>
      <td>${escapeHtml(note.author || "")}</td>
      <td>${renderChips(splitTags(note.tags))}</td>
      <td>${renderChips(note.albums || [])}</td>
      <td>${escapeHtml(note.status || "")}</td>
      <td>
        <div class="link-group">
          ${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">原文</a>` : ""}
          ${notionUrl ? `<a href="${escapeHtml(notionUrl)}" target="_blank" rel="noreferrer">Notion</a>` : ""}
        </div>
      </td>
    </tr>
  `;
}

function renderChips(items) {
  if (!items.length) return "";
  return `<div class="chip-list">${items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}</div>`;
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
  const selected = state.selectedIds.size;
  el.selectedCount.textContent = selected;
  el.addAlbumButton.disabled = selected === 0 || !el.targetAlbumSelect.value;

  const visibleIds = state.notes.map((note) => note.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => state.selectedIds.has(id));
  el.selectAllCheckbox.checked = allSelected;
  el.selectAllCheckbox.indeterminate = !allSelected && visibleIds.some((id) => state.selectedIds.has(id));
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

function truncate(value, length) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function bindEvents() {
  el.searchButton.addEventListener("click", loadNotes);
  el.refreshButton.addEventListener("click", loadNotes);
  el.addAlbumButton.addEventListener("click", addSelectedToAlbum);
  el.targetAlbumSelect.addEventListener("change", updateSelection);

  el.selectAllCheckbox.addEventListener("change", () => {
    for (const note of state.notes) {
      if (el.selectAllCheckbox.checked) {
        state.selectedIds.add(note.id);
      } else {
        state.selectedIds.delete(note.id);
      }
    }
    renderNotes();
    updateSelection();
  });

  for (const input of [el.searchInput, el.titleInput, el.authorInput, el.tagInput]) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") loadNotes();
    });
  }
}

async function init() {
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
