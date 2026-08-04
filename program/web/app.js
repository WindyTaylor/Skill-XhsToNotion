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
  tokenFields: new Map(),
  dragSelect: null,
  suppressNextCardClick: false,
  batchProgressTimer: 0,
  imagePickerNoteId: "",
  imagePickerImages: [],
  selectedImageKeys: new Set(),
  imagePickerBusy: false,
  imagePreviewOpen: false,
  albumPickers: new Map(),
  draggedAlbumName: "",
  draggedAlbumPickerValue: "",
  albumPickerDragging: false,
};

const BACKGROUND_STORAGE_KEY = "xhs-notion-console-background";
const DESCRIPTION_PANEL_STORAGE_KEY = "xhs-notion-console-description-panel";
const ALBUM_ORDER_STORAGE_KEY = "xhs-notion-console-album-order";
const BACKGROUND_SYNC_CHANNEL = "xhs-notion-console-background-sync";
const MAX_BACKGROUND_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_BACKGROUND_DATA_URL_BYTES = 3.5 * 1024 * 1024;
const BACKGROUND_MAX_EDGE = 2200;
const BACKGROUND_IMAGE_QUALITY = 0.84;
const MAX_ALBUM_DESCRIPTION_LENGTH = 2000;
const TAG_COLOR_COUNT = 9;
const DESCRIPTION_DOCK_MEDIA = "(min-width: 1880px)";
const NOTE_STATUSES = ["待阅读", "已整理", "待执行"];
const SEARCH_TOKEN_FIELD_DELIMITER_PATTERN = /[+＋]+/;
const MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN = /[+＋,，、\/／]+/;
const DRAG_SELECT_THRESHOLD = 6;
const DRAG_SELECT_AUTO_SCROLL_EDGE = 82;
const DRAG_SELECT_AUTO_SCROLL_MAX_SPEED = 24;
const BATCH_PROGRESS_TICK_MS = 1000;
const BATCH_SLOW_HINT_SECONDS = 8;
const TOKEN_FIELD_INPUTS = [
  ["searchInput", "综合搜索关键词", { delimiterPattern: SEARCH_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: " + " }],
  ["titleInput", "标题关键词", { delimiterPattern: SEARCH_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: " + " }],
  ["authorInput", "作者关键词", { delimiterPattern: SEARCH_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: " + " }],
  ["tagInput", "标签关键词", { delimiterPattern: SEARCH_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: " + " }],
];
const MATERIAL_TOKEN_FIELD_INPUTS = [
  ["compositionTagsInput", "构图标签", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "构图标签", suggestionsFromPlaceholder: true }],
  ["colorTagsInput", "色彩标签", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "色彩标签", suggestionsFromPlaceholder: true }],
  ["actionTagsInput", "动作标签", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "动作标签", suggestionsFromPlaceholder: true }],
  ["clothingTagsInput", "服装类型", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "服装类型标签", suggestionsFromPlaceholder: true }],
  ["moodTagsInput", "情绪氛围", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "情绪氛围标签", suggestionsFromPlaceholder: true }],
  ["peopleTagsInput", "人数类型", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "人数类型标签", suggestionsFromPlaceholder: true }],
  ["lightTagsInput", "光线标签", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "光线标签", suggestionsFromPlaceholder: true }],
  ["sceneInput", "场景", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "场景标签", suggestionsFromPlaceholder: true }],
  ["timeTagsInput", "时间类型", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "时间类型标签", suggestionsFromPlaceholder: true }],
  ["weatherTagsInput", "天气类型", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "天气类型标签", suggestionsFromPlaceholder: true }],
  ["angleTagsInput", "机位角度", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "机位角度标签", suggestionsFromPlaceholder: true }],
  ["focalLengthTagsInput", "焦段类型", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "焦段类型标签", suggestionsFromPlaceholder: true }],
  ["customTagsInput", "新增标签", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "新增标签", suggestionsFromPlaceholder: false }],
  ["shotTypeSelect", "景别", { delimiterPattern: MATERIAL_TOKEN_FIELD_DELIMITER_PATTERN, outputSeparator: ", ", tokenKindLabel: "景别标签", suggestionsFromPlaceholder: true }],
];
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
  backgroundLayer: document.querySelector("#backgroundLayer"),
  backgroundInput: document.querySelector("#backgroundInput"),
  materialsButton: document.querySelector("#materialsButton"),
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
  selectionInlineCount: document.querySelector("#selectionInlineCount"),
  message: document.querySelector("#message"),
  selectionMarquee: document.querySelector("#selectionMarquee"),
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
  imagePickerBackdrop: document.querySelector("#imagePickerBackdrop"),
  imagePickerModal: document.querySelector("#imagePickerModal"),
  imagePickerClose: document.querySelector("#imagePickerClose"),
  imagePickerTitle: document.querySelector("#imagePickerTitle"),
  imagePickerSubtitle: document.querySelector("#imagePickerSubtitle"),
  imagePickerMeta: document.querySelector("#imagePickerMeta"),
  imagePickerRefresh: document.querySelector("#imagePickerRefresh"),
  imagePasteZone: document.querySelector("#imagePasteZone"),
  imagePickerGrid: document.querySelector("#imagePickerGrid"),
  imageMaterialForm: document.querySelector("#imageMaterialForm"),
  compositionTagsInput: document.querySelector("#compositionTagsInput"),
  actionTagsInput: document.querySelector("#actionTagsInput"),
  sceneInput: document.querySelector("#sceneInput"),
  shotTypeSelect: document.querySelector("#shotTypeSelect"),
  clothingTagsInput: document.querySelector("#clothingTagsInput"),
  weatherTagsInput: document.querySelector("#weatherTagsInput"),
  timeTagsInput: document.querySelector("#timeTagsInput"),
  peopleTagsInput: document.querySelector("#peopleTagsInput"),
  focalLengthTagsInput: document.querySelector("#focalLengthTagsInput"),
  angleTagsInput: document.querySelector("#angleTagsInput"),
  lightTagsInput: document.querySelector("#lightTagsInput"),
  colorTagsInput: document.querySelector("#colorTagsInput"),
  moodTagsInput: document.querySelector("#moodTagsInput"),
  customTagsInput: document.querySelector("#customTagsInput"),
  learningNoteTextarea: document.querySelector("#learningNoteTextarea"),
  remakeHintTextarea: document.querySelector("#remakeHintTextarea"),
  materialStatusSelect: document.querySelector("#materialStatusSelect"),
  materialRatingSelect: document.querySelector("#materialRatingSelect"),
  materialRatingStars: document.querySelector("#materialRatingStars"),
  remakeReadyCheckbox: document.querySelector("#remakeReadyCheckbox"),
  materialUploadCheckbox: document.querySelector("#materialUploadCheckbox"),
  imageMaterialNotice: document.querySelector("#imageMaterialNotice"),
  saveMaterialsButton: document.querySelector("#saveMaterialsButton"),
};

class TokenField {
  constructor(input, label, options = {}) {
    this.input = input;
    this.label = label;
    this.delimiterPattern = options.delimiterPattern || SEARCH_TOKEN_FIELD_DELIMITER_PATTERN;
    this.outputSeparator = options.outputSeparator || " + ";
    this.tokenKindLabel = options.tokenKindLabel || "关键词";
    this.tokens = [];
    this.suggestedTokens = options.suggestionsFromPlaceholder
      ? this.split(input.placeholder)
      : Array.isArray(options.suggestedTokens)
        ? options.suggestedTokens
        : [];
    this.selectedIndex = -1;
    this.isComposing = false;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "token-field";
    this.wrapper.setAttribute("role", "group");
    this.wrapper.setAttribute("aria-label", label);
    this.wrapper.title = input.title || label;
    input.parentNode.insertBefore(this.wrapper, input);
    this.wrapper.appendChild(input);
    input.classList.add("token-field-input");
    if (this.suggestedTokens.length) {
      input.dataset.originalPlaceholder = input.placeholder || "";
      input.placeholder = options.draftPlaceholder || "输入新标签";
    }

    this.render();
    this.bind();
    this.syncDisabledState();
    this.disabledObserver = new MutationObserver(() => this.syncDisabledState());
    this.disabledObserver.observe(input, { attributes: true, attributeFilter: ["disabled"] });
  }

  bind() {
    this.wrapper.addEventListener("mousedown", (event) => {
      if (event.target === this.wrapper) {
        event.preventDefault();
        this.input.focus();
        this.clearSelection();
      }
    });
    this.wrapper.addEventListener("click", (event) => {
      const suggestion = event.target.closest(".token-suggestion");
      if (suggestion) {
        event.preventDefault();
        event.stopPropagation();
        if (!this.input.disabled) {
          this.addTokens([suggestion.dataset.tokenValue]);
          this.input.focus();
        }
        return;
      }

      const removeButton = event.target.closest(".token-remove");
      if (removeButton) {
        event.preventDefault();
        event.stopPropagation();
        this.removeToken(Number(removeButton.dataset.tokenIndex));
        this.input.focus();
        return;
      }
      const token = event.target.closest(".token-item");
      if (token) {
        event.preventDefault();
        this.selectToken(Number(token.dataset.tokenIndex));
        this.input.focus();
      }
    });
    this.input.addEventListener("compositionstart", () => {
      this.isComposing = true;
    });
    this.input.addEventListener("compositionend", () => {
      this.isComposing = false;
      this.consumeDelimitedInput();
    });
    this.input.addEventListener("input", () => {
      if (!this.isComposing) this.consumeDelimitedInput();
      this.clearSelection();
    });
    this.input.addEventListener("keydown", (event) => this.handleKeydown(event));
    this.input.addEventListener("blur", () => this.commitDraft());
  }

  handleKeydown(event) {
    if (this.input.disabled || this.isComposing) return;
    const hasDraft = Boolean(this.input.value.trim());

    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      this.isDelimiterKey(event.key)
    ) {
      event.preventDefault();
      this.commitDraft();
      return;
    }

    if (event.key === "Enter") {
      this.commitDraft();
      return;
    }

    if (event.key === "Escape") {
      this.clearSelection();
      return;
    }

    if (event.key === "Backspace" && !hasDraft) {
      event.preventDefault();
      if (this.selectedIndex >= 0) {
        const nextIndex = Math.min(this.selectedIndex, this.tokens.length - 2);
        this.removeToken(this.selectedIndex);
        if (nextIndex >= 0) this.selectToken(nextIndex);
      } else if (this.tokens.length) {
        this.selectToken(this.tokens.length - 1);
      }
      return;
    }

    if (event.key === "Delete" && this.selectedIndex >= 0) {
      event.preventDefault();
      this.removeToken(this.selectedIndex);
      return;
    }

    if (event.key === "ArrowLeft" && !hasDraft && this.tokens.length) {
      event.preventDefault();
      const nextIndex =
        this.selectedIndex < 0
          ? this.tokens.length - 1
          : Math.max(0, this.selectedIndex - 1);
      this.selectToken(nextIndex);
      return;
    }

    if (event.key === "ArrowRight" && this.selectedIndex >= 0) {
      event.preventDefault();
      if (this.selectedIndex >= this.tokens.length - 1) {
        this.clearSelection();
      } else {
        this.selectToken(this.selectedIndex + 1);
      }
    }
  }

  consumeDelimitedInput() {
    const parts = this.split(this.input.value);
    if (parts.length <= 1) return;
    this.addTokens(parts.slice(0, -1));
    this.input.value = parts.at(-1) || "";
  }

  commitDraft() {
    const parts = this.split(this.input.value);
    const committed = parts.filter(Boolean);
    if (committed.length) {
      this.addTokens(committed);
      this.input.value = "";
    }
    this.clearSelection();
  }

  split(value) {
    return String(value || "")
      .split(this.delimiterPattern)
      .map((item) => item.trim())
      .filter((item, index, list) => item || index === list.length - 1);
  }

  isDelimiterKey(key) {
    return key.length === 1 && this.delimiterPattern.test(key);
  }

  addTokens(values) {
    const existing = new Set(this.tokens.map((item) => item.toLowerCase()));
    for (const value of values) {
      const cleanValue = String(value || "").trim();
      const lookup = cleanValue.toLowerCase();
      if (!cleanValue || existing.has(lookup)) continue;
      this.tokens.push(cleanValue);
      existing.add(lookup);
    }
    this.render();
  }

  removeToken(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.tokens.length) return;
    this.tokens.splice(index, 1);
    this.selectedIndex = -1;
    this.render();
  }

  selectToken(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.tokens.length) {
      this.clearSelection();
      return;
    }
    this.selectedIndex = index;
    this.render();
  }

  clearSelection() {
    if (this.selectedIndex < 0) return;
    this.selectedIndex = -1;
    this.render();
  }

  value() {
    return [...this.tokens, this.input.value.trim()].filter(Boolean).join(this.outputSeparator);
  }

  syncDisabledState() {
    this.wrapper.classList.toggle("is-disabled", this.input.disabled);
    this.wrapper.setAttribute("aria-disabled", String(this.input.disabled));
    this.wrapper.querySelectorAll(".token-suggestion").forEach((button) => {
      button.disabled = this.input.disabled;
    });
  }

  render() {
    this.wrapper
      .querySelectorAll(".token-item, .token-suggestion")
      .forEach((node) => node.remove());
    this.tokens.forEach((token, index) => {
      const item = document.createElement("span");
      item.className = `token-item${index === this.selectedIndex ? " is-selected" : ""}`;
      item.dataset.tokenIndex = String(index);
      item.title = token;

      const text = document.createElement("span");
      text.className = "token-text";
      text.textContent = token;

      const removeButton = document.createElement("button");
      removeButton.className = "token-remove";
      removeButton.type = "button";
      removeButton.tabIndex = -1;
      removeButton.dataset.tokenIndex = String(index);
      removeButton.setAttribute("aria-label", `移除${this.tokenKindLabel} ${token}`);
      removeButton.textContent = "×";

      item.append(text, removeButton);
      this.wrapper.insertBefore(item, this.input);
    });

    const selectedTokens = new Set(this.tokens.map((token) => token.toLowerCase()));
    this.suggestedTokens
      .filter((token) => !selectedTokens.has(token.toLowerCase()))
      .forEach((token) => {
        const suggestion = document.createElement("button");
        suggestion.className = "token-suggestion";
        suggestion.type = "button";
        suggestion.dataset.tokenValue = token;
        suggestion.title = `点击添加${this.tokenKindLabel} ${token}`;
        suggestion.setAttribute("aria-label", `添加${this.tokenKindLabel} ${token}`);
        suggestion.textContent = token;
        suggestion.disabled = this.input.disabled;
        this.wrapper.insertBefore(suggestion, this.input);
      });
  }
}

function ensureContextMenu() {
  if (el.contextMenu) return el.contextMenu;

  const menu = document.createElement("div");
  menu.className = "note-context-menu is-hidden";
  menu.setAttribute("role", "menu");
  menu.innerHTML = `
    <div class="note-context-title"></div>
    <button class="note-context-action" type="button" role="menuitem" data-context-action="source">
      <span class="note-context-icon" aria-hidden="true">↗</span>
      <span>打开小红书原文</span>
    </button>
    <button class="note-context-action" type="button" role="menuitem" data-context-action="notion">
      <span class="note-context-icon" aria-hidden="true">N</span>
      <span>打开 Notion 页面</span>
    </button>
    <div class="note-context-divider" aria-hidden="true"></div>
    <div class="note-context-section-label">修改状态</div>
    <div class="note-context-status-list">
      ${NOTE_STATUSES.map(
        (status) => `
          <button class="note-context-action note-context-status-action" type="button" role="menuitem" data-context-status="${escapeAttr(status)}">
            <span class="note-context-icon" aria-hidden="true">●</span>
            <span>${escapeHtml(status)}</span>
          </button>
        `
      ).join("")}
    </div>
    <div class="note-context-divider" aria-hidden="true"></div>
    <button class="note-context-action is-danger" type="button" role="menuitem" data-context-action="delete">
      <span class="note-context-icon" aria-hidden="true">⌫</span>
      <span>删除该篇笔记</span>
    </button>
  `;
  document.body.appendChild(menu);

  el.contextMenu = menu;
  el.contextTitle = menu.querySelector(".note-context-title");
  el.openSourceButton = menu.querySelector('[data-context-action="source"]');
  el.openNotionButton = menu.querySelector('[data-context-action="notion"]');
  el.deleteNoteButton = menu.querySelector('[data-context-action="delete"]');
  el.contextStatusButtons = Array.from(menu.querySelectorAll("[data-context-status]"));
  el.openSourceButton.addEventListener("click", () => openContextNoteLink("source"));
  el.openNotionButton.addEventListener("click", () => openContextNoteLink("notion"));
  el.deleteNoteButton.addEventListener("click", deleteContextNote);
  el.contextStatusButtons.forEach((button) => {
    button.addEventListener("click", () => updateContextNoteStatus(button.dataset.contextStatus));
  });
  return menu;
}

function setMessage(text, type = "") {
  el.message.textContent = text || "";
  el.message.className = `message${type ? ` is-${type}` : ""}`;
}

function getNoteById(pageId) {
  return state.notes.find((note) => note.id === pageId);
}

function findRenderedCard(pageId) {
  return Array.from(el.notesGrid.querySelectorAll(".card")).find(
    (cardEl) => cardEl.dataset.pageId === pageId
  );
}

function removeRenderedCard(pageId) {
  findRenderedCard(pageId)?.remove();
  state.selectedIds.delete(pageId);
  state.notes = state.notes.filter((note) => note.id !== pageId);
  el.emptyState.classList.toggle("is-visible", state.notes.length === 0);
  updateSelection();
  updateResultMeta();
}

function updateRenderedCardStatus(pageId, status) {
  const cardEl = findRenderedCard(pageId);
  if (!cardEl) return;
  const statusEl = cardEl.querySelector(".card-bottom-status.status");
  const statusText = cardEl.querySelector(".status-text");
  if (!statusEl || !statusText) return;
  const cleanStatus = status || "";
  statusEl.classList.toggle("is-empty", !cleanStatus);
  statusEl.title = `状态：${cleanStatus || "无状态"}`;
  statusText.textContent = cleanStatus || "无状态";
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
  const sourceUrl = note.url || "";
  const notionUrl = note.notion_url || "";
  el.openSourceButton.disabled = !sourceUrl;
  el.openSourceButton.title = sourceUrl ? sourceUrl : "这篇笔记没有原文链接";
  el.openNotionButton.disabled = !notionUrl || notionUrl === "#";
  el.openNotionButton.title = notionUrl && notionUrl !== "#" ? notionUrl : "这篇笔记没有 Notion 链接";
  el.contextStatusButtons?.forEach((button) => {
    const isCurrent = button.dataset.contextStatus === note.status;
    button.classList.toggle("is-current", isCurrent);
    button.disabled = isCurrent;
    button.title = isCurrent ? "当前状态" : `改为「${button.dataset.contextStatus}」`;
  });
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
    if (el.backgroundLayer) {
      el.backgroundLayer.style.removeProperty("backgroundImage");
    }
    document.body.classList.remove("has-custom-bg");
    return;
  }
  const backgroundImage = `linear-gradient(rgba(246, 244, 239, 0.18), rgba(246, 244, 239, 0.38)), url("${dataUrl}")`;
  document.documentElement.style.setProperty("--custom-bg-image", `url("${dataUrl}")`);
  if (el.backgroundLayer) {
    el.backgroundLayer.style.backgroundImage = backgroundImage;
  }
  document.body.classList.add("has-custom-bg");
}

function loadSavedBackground() {
  try {
    const saved = localStorage.getItem(BACKGROUND_STORAGE_KEY);
    if (saved) applyBackground(saved);
  } catch (error) {
    setMessage("浏览器阻止读取本地背景设置，可重新上传临时背景。", "error");
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("读取压缩后的图片失败。")));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function prepareBackgroundImage(file) {
  if (file.size > MAX_BACKGROUND_SOURCE_BYTES) {
    throw new Error(
      `背景图片过大，请选择 ${formatBytes(MAX_BACKGROUND_SOURCE_BYTES)} 以内的图片。`
    );
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new Error("浏览器无法读取这张图片，请换成 PNG、JPG 或 WebP。");
  }

  const scale = Math.min(1, BACKGROUND_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    bitmap.close?.();
    throw new Error("浏览器无法处理背景图片。");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let blob = await canvasToBlob(canvas, "image/webp", BACKGROUND_IMAGE_QUALITY);
  if (!blob) {
    blob = await canvasToBlob(canvas, "image/jpeg", BACKGROUND_IMAGE_QUALITY);
  }
  if (!blob) throw new Error("压缩背景图片失败，请换一张图片重试。");

  const dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > MAX_BACKGROUND_DATA_URL_BYTES) {
    throw new Error(
      `背景图片处理后仍然偏大（${formatBytes(dataUrl.length)}），请换一张更小的图片。`
    );
  }
  return { dataUrl, outputBytes: dataUrl.length };
}

async function handleBackgroundUpload(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setMessage("请选择图片文件。", "error");
    if (el.backgroundInput) el.backgroundInput.value = "";
    return;
  }

  const originalLabel = el.backgroundButton.textContent;
  el.backgroundButton.disabled = true;
  el.backgroundButton.textContent = "处理中...";
  setMessage(`正在处理背景图片（${formatBytes(file.size)}）...`);

  try {
    const { dataUrl, outputBytes } = await prepareBackgroundImage(file);
    applyBackground(dataUrl);
    publishBackgroundToMaterials();
    try {
      localStorage.setItem(BACKGROUND_STORAGE_KEY, dataUrl);
      setMessage(
        `背景已更新，并已压缩保存到当前浏览器（${formatBytes(file.size)} → ${formatBytes(outputBytes)}）。`,
        "success"
      );
    } catch (error) {
      setMessage("背景已临时应用，但浏览器本地存储空间不足，刷新后可能失效。", "error");
    }
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    el.backgroundButton.disabled = false;
    el.backgroundButton.textContent = originalLabel;
    if (el.backgroundInput) el.backgroundInput.value = "";
  }
}

function clearBackground() {
  localStorage.removeItem(BACKGROUND_STORAGE_KEY);
  applyBackground("");
  publishBackgroundToMaterials();
  if (el.backgroundInput) el.backgroundInput.value = "";
  setMessage("背景已清除。", "success");
}

function getCurrentBackgroundDataUrl() {
  try {
    const saved = localStorage.getItem(BACKGROUND_STORAGE_KEY);
    if (saved) return saved;
  } catch (error) {
    // Fall back to the live CSS variable when storage is unavailable.
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--custom-bg-image")
    .trim();
  const match = value.match(/^url\(["']?(.*?)["']?\)$/);
  return match ? match[1] : "";
}

function publishBackgroundToMaterials(targetWindow = null) {
  const payload = {
    type: "xhs-background-sync",
    background: getCurrentBackgroundDataUrl(),
  };

  if (targetWindow) {
    try {
      targetWindow.postMessage(payload, window.location.origin);
    } catch (error) {
      // The local background cache remains the fallback.
    }
  }

  if ("BroadcastChannel" in window) {
    try {
      const channel = new BroadcastChannel(BACKGROUND_SYNC_CHANNEL);
      channel.postMessage(payload);
      channel.close();
    } catch (error) {
      // BroadcastChannel is optional.
    }
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const contentType = response.headers.get("Content-Type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { error: await response.text() };
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("需要登录后访问管理台。请刷新页面并输入管理员账号密码。");
    }
    throw new Error(data.error || data.message || `请求失败：${response.status}`);
  }
  return data;
}

function closeAlbumPickers(exceptSelect = null) {
  state.albumPickers.forEach((picker, select) => {
    if (select !== exceptSelect) {
      picker.wrapper.classList.remove("is-open");
      picker.button.setAttribute("aria-expanded", "false");
    }
  });
}

function getAlbumSelectOptions(select) {
  return Array.from(select.options).map((option) => ({
    value: option.value,
    label: option.textContent || "",
    selected: option.selected,
  }));
}

function ensureAlbumPicker(select, placeholder) {
  if (state.albumPickers.has(select)) return state.albumPickers.get(select);

  const wrapper = document.createElement("span");
  wrapper.className = "album-picker";
  wrapper.dataset.albumPicker = select.id;

  const button = document.createElement("button");
  button.className = "album-picker-button";
  button.type = "button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");

  const label = document.createElement("span");
  label.className = "album-picker-label";

  const icon = document.createElement("span");
  icon.className = "album-picker-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "⌄";

  const menu = document.createElement("div");
  menu.className = "album-picker-menu";
  menu.setAttribute("role", "listbox");

  button.append(label, icon);
  wrapper.append(button, menu);
  select.classList.add("album-native-select");
  select.closest(".chip")?.classList.add("has-album-picker");
  select.closest(".bulk-action-card")?.classList.add("has-album-picker");
  select.insertAdjacentElement("afterend", wrapper);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (select.disabled) return;
    const nextOpen = !wrapper.classList.contains("is-open");
    closeAlbumPickers(nextOpen ? select : null);
    wrapper.classList.toggle("is-open", nextOpen);
    button.setAttribute("aria-expanded", String(nextOpen));
  });

  menu.addEventListener("click", (event) => {
    if (state.albumPickerDragging) return;
    const menuRect = menu.getBoundingClientRect();
    if (event.clientX >= menuRect.right - 18) return;
    const option = event.target.closest(".album-picker-option");
    if (!option || select.disabled) return;
    event.preventDefault();
    select.value = option.dataset.value || "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    renderAlbumPicker(select);
    closeAlbumPickers();
  });

  menu.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  menu.addEventListener("wheel", (event) => {
    event.stopPropagation();
  }, { passive: true });
  menu.addEventListener("dragstart", (event) => {
    const option = event.target.closest(".album-picker-option");
    if (!option || !option.dataset.value) return;
    state.draggedAlbumPickerValue = option.dataset.value;
    state.albumPickerDragging = true;
    option.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggedAlbumPickerValue);
  });
  menu.addEventListener("dragover", (event) => {
    const option = event.target.closest(".album-picker-option");
    if (!option || !option.dataset.value || !state.draggedAlbumPickerValue) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    menu
      .querySelectorAll(".album-picker-option.is-drag-over")
      .forEach((item) =>
        item.classList.remove("is-drag-over", "is-drop-before", "is-drop-after")
      );
    if (option.dataset.value !== state.draggedAlbumPickerValue) {
      const rect = option.getBoundingClientRect();
      const isAfter = event.clientY > rect.top + rect.height / 2;
      option.classList.add("is-drag-over");
      option.classList.toggle("is-drop-before", !isAfter);
      option.classList.toggle("is-drop-after", isAfter);
    }
  });
  menu.addEventListener("dragleave", (event) => {
    const option = event.target.closest(".album-picker-option");
    if (option && !option.contains(event.relatedTarget)) {
      option.classList.remove("is-drag-over", "is-drop-before", "is-drop-after");
    }
  });
  menu.addEventListener("drop", (event) => {
    const option = event.target.closest(".album-picker-option");
    if (!option || !option.dataset.value || !state.draggedAlbumPickerValue) return;
    event.preventDefault();
    moveAlbumValueTo(state.draggedAlbumPickerValue, option.dataset.value, {
      after: option.classList.contains("is-drop-after"),
    });
    clearAlbumPickerDragState();
  });
  menu.addEventListener("dragend", clearAlbumPickerDragState);

  select.addEventListener("change", () => renderAlbumPicker(select));
  const picker = { wrapper, button, label, menu, placeholder };
  state.albumPickers.set(select, picker);
  return picker;
}

function renderAlbumPicker(select) {
  if (!select) return;
  const isFilter = select === el.albumFilterSelect;
  const picker = ensureAlbumPicker(
    select,
    isFilter ? "全部" : "选择目标专辑"
  );
  const options = getAlbumSelectOptions(select);
  const selected = options.find((option) => option.selected) || options[0];
  picker.label.textContent = selected?.label || picker.placeholder;
  picker.button.disabled = select.disabled;
  picker.wrapper.classList.toggle("is-disabled", select.disabled);
  picker.menu.innerHTML = options
    .map(
      (option) => `
        <button
          class="album-picker-option${option.selected ? " is-selected" : ""}${option.value ? "" : " is-placeholder"}"
          type="button"
          role="option"
          draggable="${option.value ? "true" : "false"}"
          aria-selected="${option.selected}"
          data-value="${escapeAttr(option.value)}"
          title="${escapeAttr(option.label)}"
        >
          <span>${escapeHtml(option.label)}</span>
        </button>
      `
    )
    .join("");
}

function renderAlbumPickers() {
  renderAlbumPicker(el.albumFilterSelect);
  renderAlbumPicker(el.targetAlbumSelect);
}

function syncAlbumPickers() {
  state.albumPickers.forEach((_picker, select) => renderAlbumPicker(select));
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
  renderAlbumPickers();
}

function filterValue(value) {
  const cleanValue = String(value || "").trim();
  if (!cleanValue || cleanValue === "选择目标专辑" || cleanValue === "全部") {
    return "";
  }
  return cleanValue;
}

function tokenFieldValue(input) {
  const tokenField = state.tokenFields.get(input);
  return tokenField ? tokenField.value() : input?.value || "";
}

function buildQueryParams(values = {}) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    const cleanValue = String(value ?? "").trim();
    if (cleanValue) params.set(key, cleanValue);
  });
  return params.toString();
}

function queryParams({ cursor = "" } = {}) {
  const params = new URLSearchParams();
  const fields = [
    ["q", tokenFieldValue(el.searchInput)],
    ["title", tokenFieldValue(el.titleInput)],
    ["author", tokenFieldValue(el.authorInput)],
    ["tag", tokenFieldValue(el.tagInput)],
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
  const serverOrder = state.albums.map((album) => album.id || album.name);
  const localOrder = normalizeAlbumOrderValues(readLocalAlbumOrder(), state.albums);
  if (localOrder.length && !albumOrdersEqual(localOrder, serverOrder)) {
    applyAlbumOrderByIds(localOrder);
    persistAlbumOrder({ quiet: true });
    return;
  }
  saveLocalAlbumOrder(serverOrder);
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
    renderAlbumPickers();
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
          draggable="true"
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

function applyAlbumOrderByNames(albumNames) {
  const nameToAlbum = new Map(state.albums.map((album) => [album.name, album]));
  const albumIds = albumNames
    .map((name) => nameToAlbum.get(name)?.id || name)
    .filter(Boolean);
  applyAlbumOrderByIds(albumIds);
}

function normalizeAlbumOrderValues(values, albums = state.albums) {
  const idToAlbum = new Map(albums.map((album) => [album.id || album.name, album]));
  const nameToAlbum = new Map(albums.map((album) => [album.name, album]));
  const normalized = [];
  const seen = new Set();
  for (const value of values || []) {
    const cleanValue = String(value || "").trim();
    const album = idToAlbum.get(cleanValue) || nameToAlbum.get(cleanValue);
    const albumId = album?.id || album?.name || "";
    if (albumId && !seen.has(albumId)) {
      normalized.push(albumId);
      seen.add(albumId);
    }
  }
  for (const album of albums) {
    const albumId = album.id || album.name;
    if (albumId && !seen.has(albumId)) {
      normalized.push(albumId);
      seen.add(albumId);
    }
  }
  return normalized;
}

function albumOrdersEqual(first, second) {
  if (first.length !== second.length) return false;
  return first.every((value, index) => value === second[index]);
}

function readLocalAlbumOrder() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ALBUM_ORDER_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function saveLocalAlbumOrder(albumIds = state.albums.map((album) => album.id || album.name)) {
  const normalized = normalizeAlbumOrderValues(albumIds);
  try {
    localStorage.setItem(ALBUM_ORDER_STORAGE_KEY, JSON.stringify(normalized));
  } catch (error) {
    // Local order is a resilience cache; backend persistence remains authoritative.
  }
  return normalized;
}

function sortAlbumDescriptionsByAlbums() {
  const rankById = new Map(
    state.albums.map((album, index) => [album.id || album.name, index])
  );
  const rankByName = new Map(
    state.albums.map((album, index) => [album.name, index])
  );
  state.albumDescriptions = [...state.albumDescriptions].sort((first, second) => {
    const firstRank = rankById.get(first.id || first.name) ?? rankByName.get(first.name) ?? Number.MAX_SAFE_INTEGER;
    const secondRank = rankById.get(second.id || second.name) ?? rankByName.get(second.name) ?? Number.MAX_SAFE_INTEGER;
    return firstRank - secondRank || first.name.localeCompare(second.name, "zh-Hans-CN");
  });
}

function applyAlbumOrderByIds(albumIds) {
  const normalizedIds = normalizeAlbumOrderValues(albumIds);
  const rankById = new Map(normalizedIds.map((id, index) => [id, index]));
  const rankForAlbum = (album) =>
    rankById.get(album.id || album.name) ?? rankById.get(album.name) ?? Number.MAX_SAFE_INTEGER;
  state.albums = [...state.albums].sort(
    (first, second) =>
      rankForAlbum(first) - rankForAlbum(second) ||
      first.name.localeCompare(second.name, "zh-Hans-CN")
  );
  sortAlbumDescriptionsByAlbums();
  populateAlbumSelects();
}

async function persistAlbumOrder({ quiet = false } = {}) {
  const albumIds = saveLocalAlbumOrder();
  const albumNames = state.albums.map((album) => album.name).filter(Boolean);
  try {
    const data = await requestJson("/api/albums/order", {
      method: "POST",
      body: JSON.stringify({ album_ids: albumIds, album_names: albumNames }),
    });
    if (Array.isArray(data.albums)) {
      state.albums = data.albums;
      saveLocalAlbumOrder(data.order || data.albums.map((album) => album.id || album.name));
      populateAlbumSelects();
      if (quiet) return;
    }
    setMessage(data.message || "专辑顺序已保存。", "success");
  } catch (error) {
    setMessage(`专辑排序保存失败：${error.message}`, "error");
    return;
    await loadAlbums();
    await loadAlbumDescriptions();
  }
}

function moveAlbumValueTo(sourceValue, targetValue, { after = false } = {}) {
  if (!sourceValue || !targetValue || sourceValue === targetValue) return;
  const albumIds = state.albums.map((album) => album.id || album.name);
  const sourceIndex = albumIds.indexOf(sourceValue);
  if (sourceIndex < 0) return;
  albumIds.splice(sourceIndex, 1);
  const targetIndex = albumIds.indexOf(targetValue);
  const insertIndex = targetIndex < 0
    ? albumIds.length
    : targetIndex + (after ? 1 : 0);
  albumIds.splice(insertIndex, 0, sourceValue);
  applyAlbumOrderByIds(albumIds);
  renderAlbumDescriptionList();
  updateDescriptionEditor();
  persistAlbumOrder();
}

function moveAlbumTo(sourceName, targetName, { after = false } = {}) {
  if (!sourceName || !targetName || sourceName === targetName) return;
  const albumNames = state.albumDescriptions.map((album) => album.name);
  const sourceIndex = albumNames.indexOf(sourceName);
  if (sourceIndex < 0) return;
  albumNames.splice(sourceIndex, 1);
  const targetIndex = albumNames.indexOf(targetName);
  const insertIndex = targetIndex < 0
    ? albumNames.length
    : targetIndex + (after ? 1 : 0);
  albumNames.splice(insertIndex, 0, sourceName);
  applyAlbumOrderByNames(albumNames);
  renderAlbumDescriptionList();
  updateDescriptionEditor();
  persistAlbumOrder();
}

function clearAlbumPickerDragState() {
  state.draggedAlbumPickerValue = "";
  window.setTimeout(() => {
    state.albumPickerDragging = false;
  }, 80);
  state.albumPickers.forEach((picker) => {
    picker.menu
      .querySelectorAll(".album-picker-option")
      .forEach((item) => {
        item.classList.remove(
          "is-dragging",
          "is-drag-over",
          "is-drop-before",
          "is-drop-after"
        );
      });
  });
}

function clearAlbumDragState() {
  state.draggedAlbumName = "";
  el.descriptionAlbumList
    .querySelectorAll(".description-album-item")
    .forEach((item) => {
      item.classList.remove(
        "is-dragging",
        "is-drag-over",
        "is-drop-before",
        "is-drop-after"
      );
    });
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
  sortAlbumDescriptionsByAlbums();
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

function isSelectionInteractiveTarget(target) {
  return Boolean(
    target?.closest?.(
      "a, button, input, select, textarea, label, [contenteditable='true'], .author-copy, .check"
    )
  );
}

function selectionRectFromPoints(startX, startY, currentX, currentY) {
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const right = Math.max(startX, currentX);
  const bottom = Math.max(startY, currentY);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}

function rectsIntersect(first, second) {
  return !(
    first.right < second.left ||
    first.left > second.right ||
    first.bottom < second.top ||
    first.top > second.bottom
  );
}

function updateSelectionMarquee(rect) {
  if (!el.selectionMarquee) return;
  el.selectionMarquee.style.left = `${rect.left}px`;
  el.selectionMarquee.style.top = `${rect.top}px`;
  el.selectionMarquee.style.width = `${rect.width}px`;
  el.selectionMarquee.style.height = `${rect.height}px`;
}

function syncRenderedSelection() {
  el.notesGrid.querySelectorAll(".card").forEach((cardEl) => {
    const pageId = cardEl.dataset.pageId;
    const checkbox = cardEl.querySelector(".check");
    const isSelected = state.selectedIds.has(pageId);
    cardEl.classList.toggle("is-selected", isSelected);
    if (checkbox) checkbox.checked = isSelected;
  });
  updateSelection();
}

function getMarqueeHitIds(rect) {
  const hitIds = [];
  el.notesGrid.querySelectorAll(".card").forEach((cardEl) => {
    const pageId = cardEl.dataset.pageId;
    if (!pageId) return;
    const cardRect = cardEl.getBoundingClientRect();
    if (rectsIntersect(rect, cardRect)) hitIds.push(pageId);
  });
  return hitIds;
}

function applyDragSelection() {
  const drag = state.dragSelect;
  if (!drag?.active) return;

  const rect = selectionRectFromPoints(
    drag.startX,
    drag.startY,
    drag.currentX,
    drag.currentY
  );
  updateSelectionMarquee(rect);

  const nextSelectedIds =
    drag.mode === "add" ? new Set(drag.baseSelectedIds) : new Set();
  getMarqueeHitIds(rect).forEach((pageId) => nextSelectedIds.add(pageId));
  state.selectedIds = nextSelectedIds;
  syncRenderedSelection();
}

function stopDragSelectionAutoScroll() {
  const drag = state.dragSelect;
  if (!drag?.autoScrollFrame) return;
  cancelAnimationFrame(drag.autoScrollFrame);
  drag.autoScrollFrame = 0;
}

function startDragSelectionAutoScroll() {
  const drag = state.dragSelect;
  if (!drag || drag.autoScrollFrame) return;

  const tick = () => {
    const currentDrag = state.dragSelect;
    if (!currentDrag?.active) return;

    let deltaY = 0;
    if (currentDrag.currentY < DRAG_SELECT_AUTO_SCROLL_EDGE) {
      deltaY = -Math.ceil(
        ((DRAG_SELECT_AUTO_SCROLL_EDGE - currentDrag.currentY) /
          DRAG_SELECT_AUTO_SCROLL_EDGE) *
          DRAG_SELECT_AUTO_SCROLL_MAX_SPEED
      );
    } else if (
      currentDrag.currentY >
      window.innerHeight - DRAG_SELECT_AUTO_SCROLL_EDGE
    ) {
      deltaY = Math.ceil(
        ((currentDrag.currentY - (window.innerHeight - DRAG_SELECT_AUTO_SCROLL_EDGE)) /
          DRAG_SELECT_AUTO_SCROLL_EDGE) *
          DRAG_SELECT_AUTO_SCROLL_MAX_SPEED
      );
    }

    if (deltaY) {
      window.scrollBy(0, deltaY);
      applyDragSelection();
      scheduleLoadMoreIfNearBottom();
    }
    currentDrag.autoScrollFrame = requestAnimationFrame(tick);
  };

  drag.autoScrollFrame = requestAnimationFrame(tick);
}

function finishDragSelection({ cancelled = false } = {}) {
  const drag = state.dragSelect;
  if (!drag) return;

  const wasActive = drag.active;
  stopDragSelectionAutoScroll();
  document.body.classList.remove("is-drag-selecting");
  el.selectionMarquee?.classList.remove("is-visible");
  state.dragSelect = null;

  if (cancelled && wasActive) {
    state.selectedIds = new Set(drag.baseSelectedIds);
    syncRenderedSelection();
  }

  if (wasActive) {
    state.suppressNextCardClick = true;
    window.setTimeout(() => {
      state.suppressNextCardClick = false;
    }, 0);
  }
}

function handleNotesGridPointerDown(event) {
  if (
    event.button !== 0 ||
    state.batchBusy ||
    state.notes.length === 0 ||
    isSelectionInteractiveTarget(event.target)
  ) {
    return;
  }

  state.dragSelect = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    active: false,
    mode: event.ctrlKey || event.metaKey || event.shiftKey ? "add" : "replace",
    baseSelectedIds: new Set(state.selectedIds),
    autoScrollFrame: 0,
  };
  el.notesGrid.setPointerCapture?.(event.pointerId);
}

function handleDragSelectionPointerMove(event) {
  const drag = state.dragSelect;
  if (!drag || event.pointerId !== drag.pointerId) return;

  drag.currentX = event.clientX;
  drag.currentY = event.clientY;

  const distance = Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY);
  if (!drag.active && distance < DRAG_SELECT_THRESHOLD) return;

  if (!drag.active) {
    drag.active = true;
    document.body.classList.add("is-drag-selecting");
    el.selectionMarquee?.classList.add("is-visible");
    startDragSelectionAutoScroll();
  }

  event.preventDefault();
  applyDragSelection();
}

function handleDragSelectionPointerUp(event) {
  const drag = state.dragSelect;
  if (!drag || event.pointerId !== drag.pointerId) return;

  drag.currentX = event.clientX;
  drag.currentY = event.clientY;
  if (drag.active) applyDragSelection();
  finishDragSelection();
}

function handleDragSelectionCancel(event) {
  const drag = state.dragSelect;
  if (drag && event.pointerId !== drag.pointerId) return;
  finishDragSelection({ cancelled: true });
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
    cardEl.addEventListener("contextmenu", (event) => {
      if (event.target.closest("a, button, input, select, textarea")) return;
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
    cardEl.querySelector(".split-images-button")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openImagePicker(pageId);
    });
    cardEl.addEventListener("click", (event) => {
      if (state.suppressNextCardClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
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

function imageKey(image) {
  return image.client_id || image.asset_id || image.source_url || String(image.index || "");
}

function setImagePickerOpen(isOpen) {
  el.imagePickerModal.classList.toggle("is-open", isOpen);
  el.imagePickerModal.setAttribute("aria-hidden", String(!isOpen));
  el.imagePickerBackdrop.classList.toggle("is-visible", isOpen);
  document.body.classList.toggle("album-editor-open", isOpen);
}

function closeImagePicker() {
  if (state.imagePickerBusy) return;
  state.imagePickerNoteId = "";
  state.imagePickerImages = [];
  state.selectedImageKeys = new Set();
  setImagePickerOpen(false);
}

function setImagePickerBusy(isBusy) {
  state.imagePickerBusy = isBusy;
  el.imagePickerModal.setAttribute("aria-busy", String(isBusy));
  el.imagePickerRefresh.disabled = isBusy || !state.imagePickerNoteId;
  el.saveMaterialsButton.disabled = isBusy || state.selectedImageKeys.size === 0;
  setMaterialRatingDisabled(isBusy);
}

function materialRatingValue() {
  return Number(el.materialRatingSelect?.value || 0);
}

function setMaterialRating(value) {
  if (!el.materialRatingSelect || !el.materialRatingStars) return;
  const rating = Math.max(0, Math.min(Number(value) || 0, 5));
  el.materialRatingSelect.value = rating ? String(rating) : "";
  renderMaterialRatingStars(rating);
}

function renderMaterialRatingStars(previewValue = materialRatingValue()) {
  if (!el.materialRatingStars) return;
  const rating = Math.max(0, Math.min(Number(previewValue) || 0, 5));
  el.materialRatingStars.querySelectorAll(".material-rating-star").forEach((button) => {
    const buttonRating = Number(button.dataset.rating || 0);
    button.classList.toggle("is-active", buttonRating <= rating);
    button.setAttribute(
      "aria-checked",
      String(buttonRating === materialRatingValue() && materialRatingValue() > 0)
    );
    button.tabIndex = buttonRating === Math.max(1, materialRatingValue()) ? 0 : -1;
  });
}

function setMaterialRatingDisabled(isDisabled) {
  if (!el.materialRatingStars) return;
  el.materialRatingStars.classList.toggle("is-disabled", isDisabled);
  el.materialRatingStars.querySelectorAll(".material-rating-star").forEach((button) => {
    button.disabled = isDisabled;
  });
}

function bindMaterialRatingStars() {
  if (!el.materialRatingStars) return;
  el.materialRatingStars.addEventListener("click", (event) => {
    const button = event.target.closest(".material-rating-star");
    if (!button || button.disabled) return;
    const nextRating = Number(button.dataset.rating || 0);
    setMaterialRating(materialRatingValue() === nextRating ? 0 : nextRating);
  });
  el.materialRatingStars.addEventListener("pointerover", (event) => {
    const button = event.target.closest(".material-rating-star");
    if (!button || button.disabled) return;
    renderMaterialRatingStars(Number(button.dataset.rating || 0));
  });
  el.materialRatingStars.addEventListener("pointerleave", () => {
    renderMaterialRatingStars();
  });
  el.materialRatingStars.addEventListener("keydown", (event) => {
    if (event.target.disabled) return;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setMaterialRating(Math.min(5, materialRatingValue() + 1 || 1));
      focusActiveMaterialRatingStar();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setMaterialRating(Math.max(0, materialRatingValue() - 1));
      focusActiveMaterialRatingStar();
    } else if (event.key === "Home") {
      event.preventDefault();
      setMaterialRating(1);
      focusActiveMaterialRatingStar();
    } else if (event.key === "End") {
      event.preventDefault();
      setMaterialRating(5);
      focusActiveMaterialRatingStar();
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      setMaterialRating(0);
      focusActiveMaterialRatingStar();
    }
  });
  renderMaterialRatingStars();
}

function focusActiveMaterialRatingStar() {
  const rating = Math.max(1, materialRatingValue());
  el.materialRatingStars
    ?.querySelector(`.material-rating-star[data-rating="${rating}"]`)
    ?.focus();
}

function setImageMaterialNotice(message = "", type = "", links = []) {
  if (!el.imageMaterialNotice) return;
  el.imageMaterialNotice.className = `image-material-notice${type ? ` is-${type}` : ""}`;
  el.imageMaterialNotice.textContent = "";
  if (!message && !links.length) return;

  const text = document.createElement("span");
  text.textContent = message;
  el.imageMaterialNotice.appendChild(text);

  links.forEach((link, index) => {
    if (!link?.url) return;
    const anchor = document.createElement("a");
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    anchor.title = link.fullTitle || link.title || "";
    anchor.textContent = link.title || `素材 ${index + 1}`;
    el.imageMaterialNotice.appendChild(anchor);
  });
}

function renderImagePicker() {
  const note = getNoteById(state.imagePickerNoteId);
  el.imagePickerTitle.textContent = note?.title || "摄影拆图";
  el.imagePickerSubtitle.textContent = note?.author
    ? `@${note.author}`
    : "选择要沉淀的图片，手动填写学习信息后保存到素材库。";
  el.imagePickerMeta.textContent = state.imagePickerImages.length
    ? `共 ${state.imagePickerImages.length} 张图片，已选 ${state.selectedImageKeys.size} 张`
    : "没有可用图片";
  el.saveMaterialsButton.disabled =
    state.imagePickerBusy || state.selectedImageKeys.size === 0;

  if (!state.imagePickerImages.length) {
    el.imagePickerGrid.innerHTML =
      '<div class="image-picker-empty">没有提取到图片。可以点“重新提取图片”，也可以点击上方粘贴区后按 Ctrl+V 加入剪切板图片。</div>';
    return;
  }

  el.imagePickerGrid.innerHTML = state.imagePickerImages
    .map((image) => {
      const key = imageKey(image);
      const preview = image.local_url || image.source_url;
      const isSelected = state.selectedImageKeys.has(key);
      return `
        <div class="image-tile${isSelected ? " is-selected" : ""}" data-image-key="${escapeAttr(key)}">
          <img class="image-tile-preview" src="${escapeAttr(preview)}" referrerpolicy="no-referrer" loading="lazy" alt="第 ${image.index} 张图片" />
          <input type="checkbox" ${isSelected ? "checked" : ""} aria-label="选择第 ${image.index} 张图片" />
          <span class="image-tile-index">#${image.index}</span>
        </div>
      `;
    })
    .join("");
}

function ensureImagePreviewOverlay() {
  let overlay = document.querySelector("#imagePreviewOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "imagePreviewOverlay";
  overlay.className = "image-preview-overlay";
  overlay.innerHTML = `
    <button class="image-preview-close" type="button" aria-label="关闭图片预览">×</button>
    <img class="image-preview-img" alt="" />
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest(".image-preview-close")) {
      closeImagePreview();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.imagePreviewOpen) {
      closeImagePreview();
    }
  });
  return overlay;
}

function openImagePreview(image) {
  const src = image?.local_url || image?.source_url || "";
  if (!src) return;
  const overlay = ensureImagePreviewOverlay();
  const img = overlay.querySelector(".image-preview-img");
  img.src = src;
  img.alt = `第 ${image.index || ""} 张图片`;
  overlay.classList.add("is-open");
  state.imagePreviewOpen = true;
}

function closeImagePreview() {
  const overlay = document.querySelector("#imagePreviewOverlay");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  state.imagePreviewOpen = false;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("读取剪切板图片失败。")));
    reader.readAsDataURL(file);
  });
}

function nextPastedImageIndex(offset = 0) {
  const maxIndex = state.imagePickerImages.reduce(
    (maxValue, image) => Math.max(maxValue, Number(image.index || 0)),
    0
  );
  return maxIndex + offset + 1;
}

async function addImageFilesToPicker(files) {
  const imageFiles = Array.from(files || []).filter((file) =>
    String(file?.type || "").startsWith("image/")
  );
  if (!imageFiles.length) {
    setImageMaterialNotice("剪切板里没有可用图片。", "error");
    return;
  }

  if (state.imagePickerImages.length + imageFiles.length > 20) {
    setImageMaterialNotice("单次最多保留 20 张待保存图片，请先保存或减少粘贴数量。", "error");
    return;
  }

  try {
    const imported = [];
    for (const [offset, file] of imageFiles.entries()) {
      const dataUrl = await fileToDataUrl(file);
      const index = nextPastedImageIndex(offset);
      imported.push({
        client_id: `pasted-${Date.now()}-${offset}`,
        source_url: dataUrl,
        local_url: dataUrl,
        index,
        title: `剪切板图片 #${index}`,
        pasted: true,
      });
    }
    state.imagePickerImages = [...state.imagePickerImages, ...imported];
    imported.forEach((image) => state.selectedImageKeys.add(imageKey(image)));
    renderImagePicker();
    setImageMaterialNotice(`已加入 ${imported.length} 张剪切板图片。`, "success");
  } catch (error) {
    setImageMaterialNotice(error.message || "读取剪切板图片失败。", "error");
  }
}

function handleImagePaste(event) {
  if (!el.imagePickerModal.classList.contains("is-open")) return;
  const files = Array.from(event.clipboardData?.files || []);
  if (!files.some((file) => String(file.type || "").startsWith("image/"))) return;
  event.preventDefault();
  addImageFilesToPicker(files);
}

async function openImagePicker(pageId, { refresh = false } = {}) {
  const note = getNoteById(pageId);
  if (!note) return;
  state.imagePickerNoteId = pageId;
  state.imagePickerImages = [];
  state.selectedImageKeys = new Set();
  setImageMaterialNotice("");
  setImagePickerOpen(true);
  renderImagePicker();
  setImagePickerBusy(true);
  el.imagePickerMeta.textContent = refresh ? "正在重新提取图片..." : "正在加载图片...";

  try {
    const data = await requestJson(
      `/api/notes/images?${buildQueryParams({ page_id: pageId, refresh: refresh ? "1" : "" })}`
    );
    state.imagePickerImages = data.images || [];
    if (state.imagePickerImages.length === 1) {
      state.selectedImageKeys.add(imageKey(state.imagePickerImages[0]));
    }
    renderImagePicker();
  } catch (error) {
    el.imagePickerGrid.innerHTML = `<div class="image-picker-empty">${escapeHtml(error.message)}</div>`;
    setMessage(error.message, "error");
  } finally {
    setImagePickerBusy(false);
  }
}

function toggleImageSelection(key) {
  if (!key) return;
  if (state.selectedImageKeys.has(key)) {
    state.selectedImageKeys.delete(key);
  } else {
    state.selectedImageKeys.add(key);
  }
  renderImagePicker();
}

function selectedImageItems() {
  return state.imagePickerImages.filter((image) =>
    state.selectedImageKeys.has(imageKey(image))
  );
}

async function submitPhotoMaterials(event) {
  event.preventDefault();
  if (state.imagePickerBusy) return;
  const selected = selectedImageItems();
  if (!selected.length) {
    setImageMaterialNotice("请先选择至少一张图片。", "error");
    return;
  }

  const sharedFields = {
    composition_tags: tokenFieldValue(el.compositionTagsInput),
    action_tags: tokenFieldValue(el.actionTagsInput),
    scene: tokenFieldValue(el.sceneInput),
    shot_type: tokenFieldValue(el.shotTypeSelect),
    clothing_tags: tokenFieldValue(el.clothingTagsInput),
    weather_tags: tokenFieldValue(el.weatherTagsInput),
    time_tags: tokenFieldValue(el.timeTagsInput),
    people_tags: tokenFieldValue(el.peopleTagsInput),
    focal_length_tags: tokenFieldValue(el.focalLengthTagsInput),
    angle_tags: tokenFieldValue(el.angleTagsInput),
    light_tags: tokenFieldValue(el.lightTagsInput),
    color_tags: tokenFieldValue(el.colorTagsInput),
    mood_tags: tokenFieldValue(el.moodTagsInput),
    custom_tags: tokenFieldValue(el.customTagsInput),
    learning_note: el.learningNoteTextarea.value,
    remake_hint: el.remakeHintTextarea.value,
    status: el.materialStatusSelect.value,
    rating: el.materialRatingSelect.value,
    remake_ready: el.remakeReadyCheckbox.checked,
    upload_to_notion: el.materialUploadCheckbox.checked,
  };
  const items = selected.map((image) => ({ ...image, ...sharedFields }));

  setImagePickerBusy(true);
  el.saveMaterialsButton.textContent = "正在保存...";
  setImageMaterialNotice(
    el.materialUploadCheckbox.checked
      ? `正在保存 ${selected.length} 张图片并上传到 Notion，可能需要几秒...`
      : `正在保存 ${selected.length} 张图片...`,
    "busy"
  );
  try {
    const data = await requestJson("/api/materials/photo", {
      method: "POST",
      body: JSON.stringify({
        page_id: state.imagePickerNoteId,
        items,
      }),
    });
    const createdLinks = (data.created || []).map((item) => ({
      title: item.index ? `素材 #${item.index}` : "素材",
      fullTitle: item.title || "",
      url: item.url,
    }));
    if (data.failed) {
      const firstFailure = data.failures?.[0]?.error;
      setImageMaterialNotice(
        `${data.message || "部分素材保存失败。"}${firstFailure ? ` ${firstFailure}` : ""}`,
        "error",
        createdLinks
      );
      setMessage(data.message || "部分摄影素材保存失败。", "error");
    } else {
      setImageMaterialNotice(
        data.message || `已保存 ${createdLinks.length} 张摄影素材。`,
        "success",
        createdLinks
      );
      setMessage(data.message || "摄影素材已保存。", "success");
      state.selectedImageKeys = new Set();
      renderImagePicker();
    }
  } catch (error) {
    const helpText = error.message.includes("NOTION_MATERIAL_DATABASE_ID")
      ? `${error.message} 保存前需要先在 program/config.json 配置摄影素材库。`
      : error.message;
    setImageMaterialNotice(helpText, "error");
    setMessage(helpText, "error");
  } finally {
    el.saveMaterialsButton.textContent = "保存选中图片";
    setImagePickerBusy(false);
  }
}

function onCoverError(img) {
  // Avoid infinite retry loops if the local fallback also fails.
  if (img.dataset.coverRetried) {
    img.classList.add("is-failed");
    return;
  }
  img.dataset.coverRetried = "1";

  const cardEl = img.closest(".card");
  const pageId = cardEl && cardEl.dataset.pageId;
  if (!pageId) {
    img.classList.add("is-failed");
    return;
  }

  fetch("/api/notes/cover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_id: pageId }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data && data.ok && data.cover) {
        img.src = data.cover;
      } else {
        img.classList.add("is-failed");
      }
    })
    .catch(() => {
      img.classList.add("is-failed");
    });
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
  const albumChips = renderAlbumChips(note.albums || []);

  const coverHtml = cover
    ? `<img class="cover-img" src="${escapeAttr(cover)}" referrerpolicy="no-referrer" loading="lazy" alt="" onerror="onCoverError(this)" />`
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
        <div class="card-bottom">
          <div class="card-bottom-row card-bottom-row-albums">
            <div class="card-bottom-albums">
              ${albumChips}
            </div>
            <button class="card-bottom-split split-images-button" type="button" data-page-id="${escapeAttr(note.id)}">拆图</button>
          </div>
          <div class="card-bottom-row card-bottom-row-status">
            <span class="card-bottom-status status ${statusClass}" title="状态：${escapeAttr(status || "无状态")}">
              <span class="status-label">状态</span>
              <span class="status-text">${escapeHtml(status || "无状态")}</span>
            </span>
            <span class="card-bottom-links links">
              ${sourceUrl ? `<a class="source-link" href="${escapeAttr(sourceUrl)}" data-page-id="${escapeAttr(note.id)}" target="_blank" rel="noreferrer">原文</a>` : ""}
              <a href="${escapeAttr(notionUrl)}" target="_blank" rel="noreferrer">Notion</a>
            </span>
          </div>
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

function renderAlbumChips(items) {
  if (!items.length) return "";
  return `<div class="album-list" aria-label="当前专辑">${items
    .map(
      (item) => `
        <span class="album-chip" title="专辑：${escapeAttr(item)}" aria-label="专辑：${escapeAttr(item)}">
          <span class="album-chip-label">${escapeHtml(item)}</span>
        </span>
      `
    )
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
  if (el.selectionInlineCount) {
    el.selectionInlineCount.textContent = hasSelection
      ? `已选 ${selectedCount} 篇`
      : "未选择";
    el.selectionInlineCount.classList.toggle("has-selection", hasSelection);
  }
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
  syncAlbumPickers();
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

function shouldClearSelectionOnBlankClick(event) {
  if (!state.selectedIds.size || state.dragSelect || state.suppressNextCardClick) {
    return false;
  }
  if (event.button && event.button !== 0) return false;

  const target = event.target;
  if (
    target.closest?.(
      [
        ".card",
        ".control-dock",
        ".bulk-panel",
        ".album-description-panel",
        ".album-picker",
        ".description-dock-trigger",
        ".description-panel-backdrop",
        ".album-editor-modal",
        ".album-editor-backdrop",
        ".context-menu",
        ".selection-gesture-hint",
        "a",
        "button",
        "input",
        "select",
        "textarea",
        "label",
      ].join(", ")
    )
  ) {
    return false;
  }

  return Boolean(
    target === document.body ||
      target === el.backgroundLayer ||
      target.closest?.(".app-shell, .grid-wrap, .grid")
  );
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

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return restSeconds ? `${minutes} 分 ${restSeconds} 秒` : `${minutes} 分`;
}

function describeBatchAction(action, payload, count) {
  if (action === "status") {
    return `正在将 ${count} 篇笔记改为「${payload.status}」`;
  }
  if (action === "album") {
    const modeLabels = {
      append: "追加到专辑",
      move: "移动到专辑",
      remove: "从专辑移除",
    };
    return `正在将 ${count} 篇笔记${modeLabels[payload.mode] || "整理到专辑"}「${payload.album_name}」`;
  }
  if (action === "ai-classify") return `正在重新分类 ${count} 篇笔记`;
  if (action === "repair-cover") return `正在补全 ${count} 篇笔记的封面`;
  if (action === "clean-tags") return `正在清理 ${count} 篇笔记的无效标签`;
  if (action === "merge-duplicates") return `正在检查并合并 ${count} 篇笔记的重复记录`;
  return `正在处理 ${count} 篇笔记`;
}

function stopBatchProgress() {
  if (!state.batchProgressTimer) return;
  clearInterval(state.batchProgressTimer);
  state.batchProgressTimer = 0;
}

function startBatchProgress({ action, payload, count }) {
  stopBatchProgress();
  const startedAt = Date.now();
  const baseMessage = describeBatchAction(action, payload, count);

  const renderProgress = () => {
    const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const slowHint =
      elapsed >= BATCH_SLOW_HINT_SECONDS
        ? "Notion 正在写入，仍在等待返回；这通常不是页面卡死。"
        : "请保持页面打开。";
    setMessage(`${baseMessage}… 已等待 ${formatElapsed(elapsed)}。${slowHint}`, "busy");
  };

  renderProgress();
  state.batchProgressTimer = window.setInterval(
    renderProgress,
    BATCH_PROGRESS_TICK_MS
  );
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
  startBatchProgress({ action, payload, count: pageIds.length });

  try {
    const data = await requestJson("/api/notes/batch", {
      method: "POST",
      body: JSON.stringify({
        action,
        page_ids: pageIds,
        ...payload,
      }),
    });
    const firstFailure = data.failures?.[0]?.error;
    const resultMessage =
      data.message || "批量操作已完成。";
    const detailedMessage =
      data.failed && firstFailure
        ? `${resultMessage} 首个失败原因：${firstFailure}`
        : resultMessage;
    const resultType = data.failed ? "error" : "success";
    await loadNotes();
    setMessage(detailedMessage, resultType);
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    stopBatchProgress();
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

function openContextNoteLink(type) {
  const note = getNoteById(state.contextNoteId);
  const url = type === "source" ? note?.url : note?.notion_url;
  if (!url || url === "#") {
    setMessage(type === "source" ? "这篇笔记没有原文链接。" : "这篇笔记没有 Notion 链接。", "error");
    hideContextMenu();
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
  hideContextMenu();
}

async function updateContextNoteStatus(status) {
  const pageId = state.contextNoteId;
  const note = getNoteById(pageId);
  if (!pageId || !note || !status) {
    hideContextMenu();
    return;
  }
  if (note.status === status) {
    hideContextMenu();
    return;
  }

  hideContextMenu();
  setMessage(`正在将《${note.title || "未命名笔记"}》改为「${status}」...`, "busy");

  try {
    const data = await requestJson("/api/notes/batch", {
      method: "POST",
      body: JSON.stringify({
        action: "status",
        page_ids: [pageId],
        status,
      }),
    });
    if (data.failed) {
      const firstFailure = data.failures?.[0]?.error;
      setMessage(
        `${data.message || "状态修改失败。"}${firstFailure ? ` 首个失败原因：${firstFailure}` : ""}`,
        "error"
      );
      return;
    }

    note.status = status;
    const activeStatus = filterValue(el.statusSelect.value);
    if (activeStatus && activeStatus !== status) {
      removeRenderedCard(pageId);
    } else {
      updateRenderedCardStatus(pageId, status);
    }
    setMessage(data.message || `已改为「${status}」。`, data.failed ? "error" : "success");
  } catch (error) {
    setMessage(error.message, "error");
  }
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

function initializeTokenFields() {
  for (const [inputKey, label, options] of [...TOKEN_FIELD_INPUTS, ...MATERIAL_TOKEN_FIELD_INPUTS]) {
    const input = el[inputKey];
    if (!input || state.tokenFields.has(input)) continue;
    state.tokenFields.set(input, new TokenField(input, label, options));
  }
}

function bindEvents() {
  ensureContextMenu();
  initializeTokenFields();
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
  el.notesGrid.addEventListener("pointerdown", handleNotesGridPointerDown);
  window.addEventListener("pointermove", handleDragSelectionPointerMove, {
    passive: false,
  });
  window.addEventListener("pointerup", handleDragSelectionPointerUp);
  window.addEventListener("pointercancel", handleDragSelectionCancel);
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
  el.imagePickerClose.addEventListener("click", closeImagePicker);
  el.imagePickerBackdrop.addEventListener("click", closeImagePicker);
  el.imagePickerRefresh.addEventListener("click", () => {
    if (state.imagePickerNoteId) {
      openImagePicker(state.imagePickerNoteId, { refresh: true });
    }
  });
  el.imagePasteZone?.addEventListener("click", () => {
    el.imagePasteZone.focus();
  });
  el.imagePasteZone?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      el.imagePasteZone.focus();
    }
  });
  el.imagePasteZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    el.imagePasteZone.classList.add("is-dragover");
  });
  el.imagePasteZone?.addEventListener("dragleave", () => {
    el.imagePasteZone.classList.remove("is-dragover");
  });
  el.imagePasteZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    el.imagePasteZone.classList.remove("is-dragover");
    addImageFilesToPicker(event.dataTransfer?.files || []);
  });
  window.addEventListener("paste", (event) => {
    if (document.activeElement === el.imagePasteZone) {
      handleImagePaste(event);
    }
  });
  el.imagePickerGrid.addEventListener("click", (event) => {
    const tile = event.target.closest(".image-tile");
    if (!tile) return;
    event.preventDefault();
    if (event.target.closest(".image-tile-preview")) {
      const image = state.imagePickerImages.find(
        (item) => imageKey(item) === tile.dataset.imageKey
      );
      openImagePreview(image);
      return;
    }
    toggleImageSelection(tile.dataset.imageKey);
  });
  bindMaterialRatingStars();
  el.imageMaterialForm.addEventListener("submit", submitPhotoMaterials);
  el.materialsButton?.addEventListener("click", () => {
    const materialsWindow = window.open("/materials.html", "_blank");
    window.setTimeout(() => publishBackgroundToMaterials(materialsWindow), 250);
    window.setTimeout(() => publishBackgroundToMaterials(materialsWindow), 900);
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
  el.descriptionAlbumList.addEventListener("dragstart", (event) => {
    const button = event.target.closest(".description-album-item");
    if (!button) return;
    state.draggedAlbumName = button.dataset.albumName || "";
    button.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", state.draggedAlbumName);
  });
  el.descriptionAlbumList.addEventListener("dragover", (event) => {
    const button = event.target.closest(".description-album-item");
    if (!button || !state.draggedAlbumName) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    el.descriptionAlbumList
      .querySelectorAll(".description-album-item.is-drag-over")
      .forEach((item) =>
        item.classList.remove("is-drag-over", "is-drop-before", "is-drop-after")
      );
    if (button.dataset.albumName !== state.draggedAlbumName) {
      const rect = button.getBoundingClientRect();
      const isAfter = event.clientY > rect.top + rect.height / 2;
      button.classList.add("is-drag-over");
      button.classList.toggle("is-drop-before", !isAfter);
      button.classList.toggle("is-drop-after", isAfter);
    }
  });
  el.descriptionAlbumList.addEventListener("dragleave", (event) => {
    const button = event.target.closest(".description-album-item");
    if (button && !button.contains(event.relatedTarget)) {
      button.classList.remove("is-drag-over", "is-drop-before", "is-drop-after");
    }
  });
  el.descriptionAlbumList.addEventListener("drop", (event) => {
    const button = event.target.closest(".description-album-item");
    if (!button || !state.draggedAlbumName) return;
    event.preventDefault();
    moveAlbumTo(state.draggedAlbumName, button.dataset.albumName || "", {
      after: button.classList.contains("is-drop-after"),
    });
    clearAlbumDragState();
  });
  el.descriptionAlbumList.addEventListener("dragend", clearAlbumDragState);
  getDescriptionTextareas().forEach((textarea) => {
    textarea.addEventListener("input", handleDescriptionDraft);
  });
  el.saveDescriptionButton.addEventListener("click", () => saveAlbumDescription());
  el.clearDescriptionButton.addEventListener("click", () =>
    saveAlbumDescription({ clear: true })
  );

  for (const input of [el.searchInput, el.titleInput, el.authorInput, el.tagInput]) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        state.tokenFields.get(input)?.commitDraft();
        loadNotes();
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (!el.contextMenu || el.contextMenu.contains(event.target)) return;
    if (!event.target.closest?.(".album-picker")) closeAlbumPickers();
    hideContextMenu();
    if (shouldClearSelectionOnBlankClick(event)) {
      clearSelection();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.dragSelect?.active) {
      handleDragSelectionCancel({ pointerId: state.dragSelect.pointerId });
      return;
    }
    if (event.key === "Escape") {
      closeAlbumPickers();
      hideContextMenu();
      if (el.albumEditorModal.classList.contains("is-open")) {
        closeAlbumEditor();
      } else if (el.imagePickerModal.classList.contains("is-open")) {
        closeImagePicker();
      } else if (state.descriptionPanelOpen) {
        setDescriptionPanelOpen(false);
      }
    }
  });
  window.addEventListener("blur", hideContextMenu);
  window.addEventListener("resize", () => {
    closeAlbumPickers();
    hideContextMenu();
    setDescriptionPanelOpen(state.descriptionPanelOpen, { persist: false });
  });
  window.addEventListener("scroll", (event) => {
    if (event.target?.closest?.(".album-picker-menu")) return;
    closeAlbumPickers();
    hideContextMenu();
  }, true);

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
  registerServiceWorker();
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

function registerServiceWorker() {
  const canRegister =
    "serviceWorker" in navigator &&
    (location.protocol === "https:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1");
  if (!canRegister) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // The app remains fully online-capable if browser policy blocks registration.
  });
}

init();
