const materialsState = {
  items: [],
  loading: false,
  hasMore: false,
  nextCursor: "",
  tags: [],
};

const BACKGROUND_STORAGE_KEY = "xhs-notion-console-background";
const BACKGROUND_SYNC_CHANNEL = "xhs-notion-console-background-sync";

const materialEl = {
  backgroundLayer: document.querySelector("#backgroundLayer"),
  meta: document.querySelector("#materialsMeta"),
  message: document.querySelector("#materialsMessage"),
  grid: document.querySelector("#materialsGrid"),
  empty: document.querySelector("#materialsEmpty"),
  searchInput: document.querySelector("#materialsSearchInput"),
  searchButton: document.querySelector("#materialsSearchButton"),
  statusSelect: document.querySelector("#materialsStatusSelect"),
  tagSelect: document.querySelector("#materialsTagSelect"),
  visibleCount: document.querySelector("#materialsVisibleCount"),
  tagCount: document.querySelector("#materialsTagCount"),
  moreState: document.querySelector("#materialsMoreState"),
  loadMoreButton: document.querySelector("#loadMoreMaterialsButton"),
  refreshButton: document.querySelector("#refreshMaterialsButton"),
  openMainButton: document.querySelector("#openMainButton"),
  previewOverlay: document.querySelector("#materialPreviewOverlay"),
  previewImg: document.querySelector("#materialPreviewImg"),
  previewClose: document.querySelector("#materialPreviewClose"),
};

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

function applyBackground(dataUrl) {
  if (!dataUrl) {
    document.documentElement.style.removeProperty("--custom-bg-image");
    materialEl.backgroundLayer?.style.removeProperty("backgroundImage");
    document.body.classList.remove("has-custom-bg");
    return;
  }

  const backgroundImage = `linear-gradient(rgba(246, 244, 239, 0.18), rgba(246, 244, 239, 0.38)), url("${dataUrl}")`;
  document.documentElement.style.setProperty("--custom-bg-image", `url("${dataUrl}")`);
  if (materialEl.backgroundLayer) {
    materialEl.backgroundLayer.style.backgroundImage = backgroundImage;
  }
  document.body.classList.add("has-custom-bg");
}

function loadSavedBackground() {
  try {
    applyBackground(localStorage.getItem(BACKGROUND_STORAGE_KEY) || "");
  } catch (error) {
    applyBackground("");
  }
}

function handleBackgroundSync(payload) {
  if (!payload || payload.type !== "xhs-background-sync") return;
  applyBackground(payload.background || "");
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || `请求失败：${response.status}`);
  }
  return data;
}

function setMaterialsMessage(message = "", type = "") {
  materialEl.message.textContent = message;
  materialEl.message.className = `message materials-inline-message${type ? ` is-${type}` : ""}`;
}

function currentFilters(cursor = "") {
  return {
    q: materialEl.searchInput.value,
    status: materialEl.statusSelect.value,
    tag: materialEl.tagSelect.value,
    cursor,
    limit: 48,
  };
}

async function loadMaterials({ append = false } = {}) {
  if (materialsState.loading) return;
  materialsState.loading = true;
  setMaterialsBusy(true);
  setMaterialsMessage(append ? "正在加载更多素材..." : "正在读取图片素材...", "busy");

  try {
    const cursor = append ? materialsState.nextCursor : "";
    const data = await requestJson(`/api/materials/photo?${buildQuery(currentFilters(cursor))}`);
    const nextItems = data.materials || [];
    materialsState.items = append ? [...materialsState.items, ...nextItems] : nextItems;
    materialsState.hasMore = Boolean(data.has_more);
    materialsState.nextCursor = data.next_cursor || "";
    materialsState.tags = data.facets?.tags || materialsState.tags;
    renderTagOptions();
    renderMaterials();
    setMaterialsMessage(
      materialsState.items.length ? `已载入 ${materialsState.items.length} 张图片素材。` : "没有匹配的图片素材。",
      materialsState.items.length ? "success" : ""
    );
  } catch (error) {
    setMaterialsMessage(error.message || "读取图片素材失败。", "error");
  } finally {
    materialsState.loading = false;
    setMaterialsBusy(false);
  }
}

function setMaterialsBusy(isBusy) {
  materialEl.refreshButton.disabled = isBusy;
  materialEl.searchButton.disabled = isBusy;
  materialEl.loadMoreButton.disabled = isBusy || !materialsState.hasMore;
  materialEl.loadMoreButton.textContent = isBusy ? "加载中..." : "加载更多";
}

function renderTagOptions() {
  const previous = materialEl.tagSelect.value;
  const options = ['<option value="">全部</option>'];
  materialsState.tags.forEach((tag) => {
    options.push(
      `<option value="${escapeAttr(tag.name)}">${escapeHtml(tag.name)} (${tag.count})</option>`
    );
  });
  materialEl.tagSelect.innerHTML = options.join("");
  if ([...materialEl.tagSelect.options].some((option) => option.value === previous)) {
    materialEl.tagSelect.value = previous;
  }
}

function renderMaterials() {
  materialEl.grid.innerHTML = materialsState.items.map(renderMaterialCard).join("");
  materialEl.empty.classList.toggle("is-visible", materialsState.items.length === 0);
  materialEl.visibleCount.textContent = String(materialsState.items.length);
  materialEl.tagCount.textContent = String(materialsState.tags.length);
  materialEl.moreState.textContent = materialsState.hasMore ? "有" : "无";
  materialEl.meta.textContent = materialsState.items.length
    ? `已载入 ${materialsState.items.length} 张图片素材`
    : "摄影素材库暂无当前筛选结果";
  materialEl.loadMoreButton.classList.toggle("is-hidden", !materialsState.hasMore);
  materialEl.loadMoreButton.disabled = materialsState.loading || !materialsState.hasMore;
}

function openMaterialPreview(imageUrl) {
  if (!imageUrl || !materialEl.previewOverlay || !materialEl.previewImg) return;
  materialEl.previewImg.src = imageUrl;
  materialEl.previewOverlay.classList.add("is-open");
  materialEl.previewOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("image-preview-open");
}

function closeMaterialPreview() {
  if (!materialEl.previewOverlay || !materialEl.previewImg) return;
  materialEl.previewOverlay.classList.remove("is-open");
  materialEl.previewOverlay.setAttribute("aria-hidden", "true");
  materialEl.previewImg.removeAttribute("src");
  document.body.classList.remove("image-preview-open");
}

function renderMaterialCard(item) {
  const tags = (item.all_tags || []).slice(0, 8);
  const tagHtml = tags.length
    ? `<div class="material-card-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`
    : "";
  const rating = Number(item.rating || 0);
  const ratingHtml = rating
    ? `<span class="material-rating-pill" title="${rating} 分">${"★".repeat(Math.max(1, Math.min(rating, 5)))}</span>`
    : "";
  const imageHtml = item.image_url
    ? `<img src="${escapeAttr(item.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<div class="material-card-fallback">无图片</div>`;
  return `
    <article class="material-card">
      <button class="material-card-image" type="button" data-preview-url="${escapeAttr(item.image_url || "")}"${item.image_url ? "" : " disabled"}>
        ${imageHtml}
      </button>
      <div class="material-card-body">
        ${ratingHtml}
        ${tagHtml}
        <div class="material-card-actions">
          ${item.source_url ? `<a href="${escapeAttr(item.source_url)}" target="_blank" rel="noreferrer">原文</a>` : ""}
          ${item.url ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">Notion</a>` : ""}
          ${item.image_link ? `<a href="${escapeAttr(item.image_link)}" target="_blank" rel="noreferrer">图片</a>` : ""}
        </div>
      </div>
    </article>
  `;
}

function bindMaterialsEvents() {
  window.addEventListener("message", (event) => {
    if (event.origin === window.location.origin) {
      handleBackgroundSync(event.data);
    }
  });
  if ("BroadcastChannel" in window) {
    try {
      const channel = new BroadcastChannel(BACKGROUND_SYNC_CHANNEL);
      channel.addEventListener("message", (event) => handleBackgroundSync(event.data));
    } catch (error) {
      // The page still syncs through postMessage/localStorage.
    }
  }
  window.addEventListener("storage", (event) => {
    if (event.key === BACKGROUND_STORAGE_KEY) {
      applyBackground(event.newValue || "");
    }
  });
  materialEl.grid.addEventListener("click", (event) => {
    const previewButton = event.target.closest(".material-card-image");
    if (!previewButton) return;
    event.preventDefault();
    openMaterialPreview(previewButton.dataset.previewUrl || "");
  });
  materialEl.previewOverlay?.addEventListener("click", (event) => {
    if (event.target === materialEl.previewOverlay || event.target === materialEl.previewClose) {
      closeMaterialPreview();
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && materialEl.previewOverlay?.classList.contains("is-open")) {
      closeMaterialPreview();
    }
  });
  materialEl.searchButton.addEventListener("click", () => loadMaterials());
  materialEl.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadMaterials();
  });
  materialEl.statusSelect.addEventListener("change", () => loadMaterials());
  materialEl.tagSelect.addEventListener("change", () => loadMaterials());
  materialEl.refreshButton.addEventListener("click", () => loadMaterials());
  materialEl.loadMoreButton.addEventListener("click", () => loadMaterials({ append: true }));
  materialEl.openMainButton.addEventListener("click", () => {
    window.open("/", "_blank", "noopener,noreferrer");
  });
}

loadSavedBackground();
bindMaterialsEvents();
loadMaterials();
