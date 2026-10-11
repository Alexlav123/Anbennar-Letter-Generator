(function () {
  "use strict";

  const config = window.AnbennarConfig;
  const formats = window.AnbennarFormats;
  const storage = window.AnbennarStorage;
  const customSeals = window.AnbennarCustomSeals;
  const calendar = window.AnbennarCalendar;
  const canvas = document.getElementById("letterCanvas");
  const renderer = new window.AnbennarRenderer.LetterRenderer(canvas, config);
  const form = document.getElementById("letterForm");
  const stateKeys = ["format", "template", "country", "surface", "issuingAuthority", "header", "subtitle", "recipient", "parties", "preamble", "body", "deadline",
    "closing", "signatory", "title", "partyA", "representativeA", "representativeTitleA", "partyB", "representativeB", "representativeTitleB",
    "sealCategory", "sealDesign", "sealCategoryA", "sealDesignA", "sealCategoryB", "sealDesignB",
    "showDate", "showCrest", "showSeal", "showPageNumbers"];
  const fields = Object.fromEntries(stateKeys.map((key) => [key, document.getElementById(key)]));
  const positionKeys = ["crestScale", "crestX", "crestY", "sealScale", "sealX", "sealY"];
  const positionFields = Object.fromEntries(positionKeys.map((key) => [key, document.getElementById(key)]));
  const calendarElements = {
    trigger: document.getElementById("datePickerButton"), value: document.getElementById("datePickerValue"), picker: document.getElementById("calendarPicker"),
    month: document.getElementById("calendarMonth"), year: document.getElementById("calendarYear"), days: document.getElementById("calendarDays"),
    previous: document.getElementById("previousMonth"), next: document.getElementById("nextMonth")
  };
  const countrySearch = document.getElementById("countrySearch");
  const countryResults = document.getElementById("countryResults");
  const libraryDialog = document.getElementById("libraryDialog");
  const customSealEditorDialog = document.getElementById("customSealEditorDialog");
  const customSealManagerDialog = document.getElementById("customSealManagerDialog");
  const bodyFormatting = {
    bold: document.getElementById("bodyBoldButton"),
    italic: document.getElementById("bodyItalicButton")
  };
  let bodySelection = { start: 0, end: 0, direction: "none" };
  let state = storage.loadLocal(config.defaultState, config);
  let library = storage.loadLibrary();
  let renderRequest = 0;
  let renderQueue = Promise.resolve();
  let saveTimer = null;
  let activeCountryIndex = -1;
  let visibleCountries = [];
  let customSealLibrary = [];
  let customSealStorageError = "";
  let customSealTarget = "sealDesign";
  let replacementSealId = "";
  const sealSelectionMemory = { sealDesign: {}, sealDesignA: {}, sealDesignB: {} };
  const visibilityTouched = new Set();

  function option(value, text) {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = text;
    return element;
  }

  function initializeOptions() {
    Object.entries(formats.FORMATS).forEach(([id, item]) => fields.format.appendChild(option(id, item.label)));
    Object.entries(config.surfaces).forEach(([id, item]) => fields.surface.appendChild(option(id, item.label)));
    fields.sealCategoryA.appendChild(option("", "No seal"));
    fields.sealCategoryB.appendChild(option("", "No seal"));
    Object.entries(config.sealCategories).forEach(([id, item]) => {
      fields.sealCategory.appendChild(option(id, item.label));
      fields.sealCategoryA.appendChild(option(id, item.label));
      fields.sealCategoryB.appendChild(option(id, item.label));
    });
    calendar.MONTHS.forEach((month, index) => calendarElements.month.appendChild(option(String(index), `${month.name} (${month.realName})`)));
  }

  function syncSealDesignOptions(categoryKey, designKey, categoryValue, designValue) {
    const categoryField = fields[categoryKey];
    const designField = fields[designKey];
    const category = config.sealCategories[categoryValue] ? categoryValue : "";
    categoryField.value = category;
    designField.replaceChildren();
    if (!category) {
      designField.appendChild(option("", "No design"));
      designField.value = "";
      designField.disabled = true;
      return "1";
    }
    const definition = config.sealCategories[category];
    if (definition.dynamic) {
      customSealLibrary.forEach((record) => designField.appendChild(option(record.id, record.name)));
      const requested = String(designValue || "");
      const exists = customSealLibrary.some((record) => record.id === requested);
      if (requested && !exists) designField.appendChild(option(requested, "Missing custom seal"));
      if (!customSealLibrary.length && !requested) designField.appendChild(option("", "No custom seals saved"));
      const resolved = exists || requested ? requested : customSealLibrary[0]?.id || "";
      designField.value = resolved;
      designField.disabled = !customSealLibrary.length && !requested;
      return resolved;
    }
    const designs = definition.designs;
    designs.forEach((design) => designField.appendChild(option(design, `Design ${design}`)));
    const resolved = designs.includes(String(designValue)) ? String(designValue) : designs[0];
    designField.value = resolved;
    designField.disabled = false;
    return resolved;
  }

  function syncAllSealDesignOptions() {
    state.sealDesign = syncSealDesignOptions("sealCategory", "sealDesign", state.sealCategory, state.sealDesign);
    state.sealDesignA = syncSealDesignOptions("sealCategoryA", "sealDesignA", state.sealCategoryA, state.sealDesignA);
    state.sealDesignB = syncSealDesignOptions("sealCategoryB", "sealDesignB", state.sealCategoryB, state.sealDesignB);
    updateCustomSealActions();
  }

  function normalizeSearch(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim(); }

  function editDistance(left, right) {
    if (!left) return right.length;
    const row = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      let previous = row[0]; row[0] = i;
      for (let j = 1; j <= right.length; j += 1) {
        const old = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1));
        previous = old;
      }
    }
    return row[right.length];
  }

  function countryMatches(country, query) {
    if (!query) return true;
    const candidates = [country.label, ...(country.aliases || [])].map(normalizeSearch);
    return candidates.some((candidate) => candidate.includes(query) || candidate.split(" ").some((word) => editDistance(word, query) <= Math.min(2, Math.floor(query.length / 3))));
  }

  function renderCountryResults(query = "") {
    const normalized = normalizeSearch(query);
    visibleCountries = Object.values(config.countries).filter((country) => countryMatches(country, normalized)).slice(0, 12);
    activeCountryIndex = visibleCountries.length ? 0 : -1;
    countryResults.replaceChildren(...visibleCountries.map((country, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.role = "option";
      button.dataset.country = country.id;
      button.className = "combobox-option";
      button.textContent = country.label;
      button.setAttribute("aria-selected", String(index === activeCountryIndex));
      return button;
    }));
    countryResults.hidden = false;
    countrySearch.setAttribute("aria-expanded", "true");
  }

  function closeCountryResults() {
    countryResults.hidden = true;
    countrySearch.setAttribute("aria-expanded", "false");
    activeCountryIndex = -1;
  }

  function selectCountry(id) {
    if (!config.countries[id]) return;
    fields.country.value = id;
    countrySearch.value = config.countries[id].label;
    state.customCrest = null;
    state.customCrestName = "";
    updateCrestStatus();
    closeCountryResults();
    update();
  }

  function updateCountryActive(nextIndex) {
    if (!visibleCountries.length) return;
    activeCountryIndex = (nextIndex + visibleCountries.length) % visibleCountries.length;
    countryResults.querySelectorAll(".combobox-option").forEach((item, index) => item.setAttribute("aria-selected", String(index === activeCountryIndex)));
    countryResults.children[activeCountryIndex]?.scrollIntoView({ block: "nearest" });
  }

  function populateTemplates() {
    fields.template.replaceChildren(option("", "No template"));
    Object.entries(formats.TEMPLATES[state.format] || {}).forEach(([id, item]) => fields.template.appendChild(option(id, item.label)));
    fields.template.value = state.template || "";
  }

  function updateFormatUI() {
    const format = formats.FORMATS[state.format] || formats.FORMATS.letter;
    document.getElementById("countryLabel").textContent = format.senderLabel;
    document.getElementById("headerLabel").textContent = format.titleLabel;
    document.getElementById("bodyLabel").textContent = format.bodyLabel;
    document.getElementById("recipientField").hidden = !format.showRecipient;
    document.getElementById("issuingAuthorityField").hidden = state.format !== "decree";
    document.getElementById("subtitleField").hidden = !format.showSubtitle;
    document.getElementById("partiesField").hidden = !format.showParties;
    document.getElementById("preambleField").hidden = !format.showPreamble;
    document.getElementById("deadlineField").hidden = !format.showDeadline;
    document.getElementById("closingField").hidden = !format.showClosing;
    document.getElementById("treatySignatures").hidden = !format.treatySignatures;
    document.getElementById("singleSignatureFields").hidden = format.treatySignatures;
    document.getElementById("sealSelectionField").hidden = format.treatySignatures;
    updateCustomSealActions();
  }

  function updateCrestStatus() {
    document.getElementById("crestFileName").textContent = state.customCrestName || "Using selected country's default crest";
    document.getElementById("clearCrestButton").disabled = !state.customCrest;
  }

  const sealPairs = [
    { category: "sealCategory", design: "sealDesign", label: "Seal" },
    { category: "sealCategoryA", design: "sealDesignA", label: "Seal A" },
    { category: "sealCategoryB", design: "sealDesignB", label: "Seal B" }
  ];

  function customSealStatusFor(pairs) {
    if (customSealStorageError) return customSealStorageError;
    const active = pairs.filter((pair) => state[pair.category] === "custom");
    const missing = active.filter((pair) => state[pair.design] && !customSealLibrary.some((record) => record.id === state[pair.design]));
    if (missing.length) return `${missing.map((pair) => pair.label).join(" and ")}: Missing custom seal. Choose or add a replacement.`;
    if (active.length && !customSealLibrary.length) return "No custom seals saved. Add one to use this category.";
    return "";
  }

  function updateCustomSealActions() {
    const treaty = state.format === "treaty";
    const singleActions = document.getElementById("singleCustomSealActions");
    const treatyActions = document.getElementById("treatyCustomSealActions");
    singleActions.hidden = treaty || state.sealCategory !== "custom";
    treatyActions.hidden = !treaty || (state.sealCategoryA !== "custom" && state.sealCategoryB !== "custom");
    document.getElementById("addCustomSealAButton").hidden = state.sealCategoryA !== "custom";
    document.getElementById("addCustomSealBButton").hidden = state.sealCategoryB !== "custom";
    document.getElementById("singleCustomSealStatus").textContent = customSealStatusFor([sealPairs[0]]);
    document.getElementById("treatyCustomSealStatus").textContent = customSealStatusFor(sealPairs.slice(1));
  }

  async function refreshCustomSealLibrary(sync = true) {
    try {
      customSealLibrary = await customSeals.list(true);
      customSealStorageError = "";
    } catch (error) {
      console.error(error);
      customSealLibrary = [];
      customSealStorageError = error.message || "Custom seal storage is unavailable.";
    }
    if (sync) syncAllSealDesignOptions();
    updateCustomSealActions();
  }

  function sealPairForDesign(designKey) {
    return sealPairs.find((pair) => pair.design === designKey) || sealPairs[0];
  }

  function selectCustomSeal(designKey, id) {
    const pair = sealPairForDesign(designKey);
    state[pair.category] = "custom";
    state[pair.design] = id;
    fields[pair.category].value = "custom";
    syncSealDesignOptions(pair.category, pair.design, "custom", id);
    sealSelectionMemory[pair.design].custom = id;
    updateCustomSealActions();
  }

  let reopenManagerAfterAdd = false;

  function openAddCustomSeal(designKey = "sealDesign", returnToManager = false) {
    customSealTarget = designKey;
    reopenManagerAfterAdd = returnToManager;
    document.getElementById("customSealEditorForm").reset();
    document.getElementById("customSealEditorStatus").textContent = "";
    customSealEditorDialog.showModal();
    document.getElementById("customSealName").focus();
  }

  function renderCustomSealManager() {
    const list = document.getElementById("customSealManagerList");
    if (!customSealLibrary.length) {
      list.innerHTML = '<p class="empty-library">No custom seals saved yet.</p>';
      return;
    }
    list.replaceChildren(...customSealLibrary.map((record) => {
      const row = document.createElement("article");
      row.className = "library-item";
      row.dataset.id = record.id;
      row.innerHTML = '<div class="custom-seal-summary"><img alt=""><strong></strong></div><div class="library-actions"><button class="button button-text" data-action="rename" type="button">Rename</button><button class="button button-text" data-action="replace" type="button">Replace image</button><button class="button button-text" data-action="delete" type="button">Delete</button></div>';
      row.querySelector("img").src = customSeals.objectUrl(record);
      row.querySelector("img").alt = `${record.name} preview`;
      row.querySelector("strong").textContent = record.name;
      return row;
    }));
  }

  function openCustomSealManager(designKey = "sealDesign") {
    customSealTarget = designKey;
    document.getElementById("customSealManagerStatus").textContent = customSealStorageError;
    renderCustomSealManager();
    customSealManagerDialog.showModal();
  }

  async function saveNewCustomSeal(event) {
    event.preventDefault();
    const status = document.getElementById("customSealEditorStatus");
    const button = document.getElementById("saveCustomSealButton");
    const file = document.getElementById("customSealImage").files[0];
    button.disabled = true;
    status.textContent = "";
    try {
      const record = await customSeals.add(document.getElementById("customSealName").value, file);
      await refreshCustomSealLibrary(false);
      selectCustomSeal(customSealTarget, record.id);
      syncAllSealDesignOptions();
      scheduleSave();
      await render();
      customSealEditorDialog.close();
      if (reopenManagerAfterAdd) openCustomSealManager(customSealTarget);
      setStatus("Custom seal saved");
    } catch (error) {
      console.error(error);
      status.textContent = error.message || "The custom seal could not be saved.";
    } finally {
      button.disabled = false;
      reopenManagerAfterAdd = false;
    }
  }

  async function renameCustomSeal(id) {
    const record = customSealLibrary.find((item) => item.id === id);
    if (!record) return;
    const name = prompt("Custom seal name:", record.name);
    if (!name) return;
    try {
      await customSeals.rename(id, name);
      await refreshCustomSealLibrary();
      renderCustomSealManager();
      render();
    } catch (error) { alert(error.message || "The custom seal could not be renamed."); }
  }

  async function deleteCustomSeal(id) {
    const record = customSealLibrary.find((item) => item.id === id);
    if (!record) return;
    const inUse = sealPairs.some((pair) => state[pair.category] === "custom" && state[pair.design] === id);
    const warning = inUse ? " The current document uses this seal and will need a replacement." : "";
    if (!confirm(`Delete "${record.name}"?${warning}`)) return;
    try {
      await customSeals.remove(id);
      await refreshCustomSealLibrary(false);
      const fallback = customSealLibrary[0]?.id || "";
      sealPairs.forEach((pair) => {
        if (state[pair.category] === "custom" && state[pair.design] === id) state[pair.design] = fallback;
        if (sealSelectionMemory[pair.design].custom === id) sealSelectionMemory[pair.design].custom = fallback;
      });
      syncAllSealDesignOptions();
      renderCustomSealManager();
      scheduleSave();
      render();
    } catch (error) { alert(error.message || "The custom seal could not be deleted."); }
  }

  function usedCustomSealIds(documentState) {
    return sealPairs
      .filter((pair) => documentState[pair.category] === "custom" && documentState[pair.design])
      .map((pair) => documentState[pair.design]);
  }

  async function portableDocumentState() {
    const payload = storage.clone(state);
    delete payload.customSeal;
    delete payload.customSealName;
    const embedded = await customSeals.exportPortable(usedCustomSealIds(payload));
    if (embedded.length) payload.embeddedCustomSeals = embedded;
    return payload;
  }

  async function restoreDocumentState(raw) {
    const documentState = storage.clone(raw);
    const remap = await customSeals.importPortable(documentState.embeddedCustomSeals);
    sealPairs.forEach((pair) => {
      if (documentState[pair.category] === "custom" && remap.has(documentState[pair.design])) documentState[pair.design] = remap.get(documentState[pair.design]);
    });
    delete documentState.embeddedCustomSeals;
    const migrated = await customSeals.migrateLegacyState(documentState);
    await refreshCustomSealLibrary(false);
    return { state: storage.normalize(migrated.state, config.defaultState, config), migrated: migrated.migrated };
  }

  function renderCalendar() {
    state.date = calendar.clampDate(state.date, config.defaultState.date);
    calendarElements.value.textContent = calendar.format(state.date);
    calendarElements.month.value = String(state.date.month);
    calendarElements.year.value = String(state.date.year);
    calendarElements.days.replaceChildren();
    const firstDay = calendar.firstWeekday(state.date.month, state.date.year);
    const dayCount = calendar.daysInMonth(state.date.month, state.date.year);
    for (let index = 0; index < firstDay; index += 1) {
      const blank = document.createElement("span"); blank.className = "calendar-blank"; blank.setAttribute("aria-hidden", "true"); calendarElements.days.appendChild(blank);
    }
    for (let day = 1; day <= dayCount; day += 1) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "calendar-day"; button.textContent = String(day); button.dataset.day = String(day);
      button.setAttribute("role", "gridcell"); button.setAttribute("aria-selected", String(day === state.date.day));
      calendarElements.days.appendChild(button);
    }
  }

  function populateForm() {
    syncAllSealDesignOptions();
    stateKeys.forEach((key) => {
      if (!fields[key]) return;
      if (fields[key].matches("[role='switch']")) fields[key].setAttribute("aria-checked", String(Boolean(state[key])));
      else fields[key].value = state[key] ?? "";
    });
    Object.entries(positionFields).forEach(([key, field]) => { field.value = state.positioning[key]; });
    countrySearch.value = config.countries[state.country]?.label || "";
    populateTemplates();
    updateFormatUI();
    renderCalendar();
    document.getElementById("crestUpload").value = "";
    updateCrestStatus();
    bodySelection = { start: 0, end: 0, direction: "none" };
    updateFormattingButtons();
  }

  function collectState() {
    stateKeys.forEach((key) => {
      if (!fields[key]) return;
      state[key] = fields[key].matches("[role='switch']") ? fields[key].getAttribute("aria-checked") === "true" : fields[key].value;
    });
    Object.entries(positionFields).forEach(([key, field]) => { state.positioning[key] = Number(field.value); });
    state.date = calendar.clampDate(state.date, config.defaultState.date);
    state.version = 8;
  }

  function setStatus(text) { document.getElementById("previewStatus").textContent = text; }

  function updatePaginationUI(info) {
    state.currentPage = info.currentPage;
    const navigation = document.getElementById("pageNavigation");
    navigation.hidden = info.pageCount <= 1;
    document.getElementById("pageIndicator").textContent = `Page ${info.currentPage + 1} of ${info.pageCount}`;
    document.getElementById("previousPageButton").disabled = info.currentPage === 0;
    document.getElementById("nextPageButton").disabled = info.currentPage >= info.pageCount - 1;
    document.getElementById("exportAllButton").hidden = info.pageCount <= 1;
    document.getElementById("exportButton").lastChild.textContent = info.pageCount > 1 ? " Export current page" : " Export PNG";
    const box = document.getElementById("fitMessage");
    const text = document.getElementById("fitMessageText");
    box.classList.remove("warning", "error");
    if (info.pageCount === 1) text.textContent = "Document fits comfortably on one page.";
    else if (info.warning) { box.classList.add("warning"); text.textContent = `Document uses ${info.pageCount} pages. Consider shortening it or using another format.`; }
    else text.textContent = `Document uses ${info.pageCount} pages.`;
    setStatus(info.pageCount > 1 ? `Document ready · ${info.pageCount} pages` : "Document ready");
  }

  function render() {
    const request = ++renderRequest;
    const renderState = storage.clone(state);
    renderQueue = renderQueue.catch(() => {}).then(async () => {
      try {
        const info = await renderer.render(renderState);
        if (request === renderRequest) updatePaginationUI(info);
      } catch (error) {
        console.error(error);
        if (request === renderRequest) setStatus("An asset could not be rendered");
      }
    });
    return renderQueue;
  }

  function scheduleSave() {
    document.getElementById("autosaveState").textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      document.getElementById("autosaveState").textContent = storage.saveLocal(state) ? "Saved locally" : "Local save unavailable";
    }, 220);
  }

  function update() { collectState(); scheduleSave(); render(); }

  function countAdjacentStars(value, index, direction) {
    let count = 0;
    for (let cursor = index + (direction < 0 ? -1 : 0); cursor >= 0 && cursor < value.length && value[cursor] === "*"; cursor += direction) count += 1;
    return count;
  }

  function styleIsActive(starCount, style) {
    return style === "bold" ? starCount >= 2 : starCount % 2 === 1;
  }

  function rememberBodySelection() {
    const editor = fields.body;
    bodySelection = { start: editor.selectionStart, end: editor.selectionEnd, direction: editor.selectionDirection || "none" };
    updateFormattingButtons();
  }

  function updateFormattingButtons() {
    const editor = fields.body;
    const value = editor.value;
    const start = document.activeElement === editor ? editor.selectionStart : bodySelection.start;
    const end = document.activeElement === editor ? editor.selectionEnd : bodySelection.end;
    const selected = value.slice(start, end);
    const leading = countAdjacentStars(selected, 0, 1);
    const trailing = countAdjacentStars(selected, selected.length, -1);
    const before = countAdjacentStars(value, start, -1);
    const after = countAdjacentStars(value, end, 1);
    bodyFormatting.bold.setAttribute("aria-pressed", String((before >= 2 && after >= 2) || (leading >= 2 && trailing >= 2)));
    bodyFormatting.italic.setAttribute("aria-pressed", String(((before % 2 === 1) && (after % 2 === 1)) || ((leading % 2 === 1) && (trailing % 2 === 1))));
  }

  function toggleInlineStyle(style) {
    const editor = fields.body;
    const marker = style === "bold" ? "**" : "*";
    let start = document.activeElement === editor ? editor.selectionStart : bodySelection.start;
    let end = document.activeElement === editor ? editor.selectionEnd : bodySelection.end;
    const direction = document.activeElement === editor ? editor.selectionDirection || "none" : bodySelection.direction;
    const value = editor.value;

    if (start === end) {
      editor.value = `${value.slice(0, start)}${marker}${marker}${value.slice(end)}`;
      start += marker.length;
      end = start;
    } else {
      const before = countAdjacentStars(value, start, -1);
      const after = countAdjacentStars(value, end, 1);
      const selected = value.slice(start, end);
      const leading = countAdjacentStars(selected, 0, 1);
      const trailing = countAdjacentStars(selected, selected.length, -1);
      const surrounded = styleIsActive(before, style) && styleIsActive(after, style);
      const included = styleIsActive(leading, style) && styleIsActive(trailing, style);

      if (surrounded) {
        editor.value = `${value.slice(0, start - marker.length)}${selected}${value.slice(end + marker.length)}`;
        start -= marker.length;
        end -= marker.length;
      } else if (included && selected.length > marker.length * 2) {
        const content = selected.slice(marker.length, -marker.length);
        editor.value = `${value.slice(0, start)}${content}${value.slice(end)}`;
        end = start + content.length;
      } else {
        editor.value = `${value.slice(0, start)}${marker}${selected}${marker}${value.slice(end)}`;
        start += marker.length;
        end += marker.length;
      }
    }

    editor.focus({ preventScroll: true });
    editor.setSelectionRange(start, end, direction);
    rememberBodySelection();
    update();
  }

  function toggleSwitch(event) {
    const button = event.currentTarget;
    visibilityTouched.add(button.id);
    button.setAttribute("aria-checked", String(button.getAttribute("aria-checked") !== "true"));
    update();
  }

  function hasStarterContent() {
    return !state.libraryId && ["header", "recipient", "body", "closing", "signatory", "title"]
      .every((key) => String(state[key] ?? "") === String(config.defaultState[key] ?? ""));
  }

  function applyNewDocumentVisibilityDefaults(format) {
    if (!hasStarterContent()) return;
    [["showCrest", "defaultShowCrest"], ["showSeal", "defaultShowSeal"], ["showDate", "defaultShowDate"]].forEach(([stateKey, defaultKey]) => {
      if (visibilityTouched.has(stateKey)) return;
      state[stateKey] = format[defaultKey] !== false;
      fields[stateKey].setAttribute("aria-checked", String(state[stateKey]));
    });
  }

  function sanitizeFilename(value, fallback) {
    const safe = String(value || "").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
    return safe || fallback;
  }

  function baseFilename() {
    const country = config.countries[state.country]?.label || "Nation";
    return `${sanitizeFilename(country, "Nation")}_${sanitizeFilename(state.header || formats.FORMATS[state.format].label, "Document")}`;
  }

  function handleCrestUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 6 * 1024 * 1024) {
      alert("Please choose a PNG, JPEG, or WebP image smaller than 6 MB."); event.target.value = ""; return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.customCrest = reader.result;
      state.customCrestName = file.name;
      updateCrestStatus();
      scheduleSave(); render();
    };
    reader.readAsDataURL(file);
  }

  async function exportCurrent() {
    const button = document.getElementById("exportButton");
    button.disabled = true; setStatus("Rendering high-resolution PNG…");
    try {
      const blob = await renderer.exportPageBlob(state, state.currentPage, 1400);
      const suffix = renderer.lastDocument?.pageCount > 1 ? `_page_${state.currentPage + 1}` : "";
      storage.download(`${baseFilename()}${suffix}.png`, blob); setStatus("PNG exported");
    } catch (error) { console.error(error); alert(`The PNG could not be exported. ${error.message || "Please try again."}`); setStatus("Export failed"); }
    finally { button.disabled = false; }
  }

  async function exportAll() {
    const button = document.getElementById("exportAllButton");
    button.disabled = true; setStatus("Rendering all pages…");
    try {
      const blobs = await renderer.exportAllBlobs(state, 1400);
      blobs.forEach((blob, index) => setTimeout(() => storage.download(`${baseFilename()}_page_${index + 1}.png`, blob), index * 180));
      setStatus(`${blobs.length} pages exported`);
    } catch (error) { console.error(error); alert(`The pages could not be exported. ${error.message || "Please try again."}`); setStatus("Export failed"); }
    finally { button.disabled = false; }
  }

  function applyTemplate(templateId) {
    const item = formats.TEMPLATES[state.format]?.[templateId];
    if (!item) { state.template = ""; return; }
    const meaningful = state.body.trim() && state.body !== config.defaultState.body;
    if (meaningful && !confirm("Apply this template? Your body text will be kept, but matching headings and structural fields will be updated.")) {
      fields.template.value = state.template || ""; return;
    }
    state.template = templateId;
    ["header", "subtitle", "preamble", "closing"].forEach((key) => { if (item[key] !== undefined) state[key] = item[key]; });
    populateForm(); scheduleSave(); render();
  }

  function libraryName() { return library.find((item) => item.id === state.libraryId)?.name || ""; }

  function saveToLibrary(forceNew = false) {
    collectState();
    let item = !forceNew && state.libraryId ? library.find((entry) => entry.id === state.libraryId) : null;
    const name = item?.name || prompt("Document name:", state.header || formats.FORMATS[state.format].label);
    if (!name) return;
    const now = new Date().toISOString();
    if (!item) {
      item = { id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: now };
      library.unshift(item);
    }
    state.libraryId = item.id;
    Object.assign(item, { name: name.trim(), format: state.format, sender: state.country, modifiedAt: now, state: storage.clone(state) });
    storage.saveLibrary(library); storage.saveLocal(state); renderLibrary(); setStatus("Saved to My Documents");
  }

  async function openLibraryDocument(id) {
    const item = library.find((entry) => entry.id === id);
    if (!item) return;
    try {
      const restored = await restoreDocumentState(item.state);
      state = restored.state;
      state.libraryId = item.id;
      if (restored.migrated) { item.state = storage.clone(state); item.modifiedAt = new Date().toISOString(); storage.saveLibrary(library); }
      visibilityTouched.clear();
      ["showCrest", "showSeal", "showDate"].forEach((key) => visibilityTouched.add(key));
      populateForm(); storage.saveLocal(state); await render(); libraryDialog.close();
    } catch (error) { alert(error.message || "That document could not be opened."); }
  }

  async function duplicateLibraryDocument(id) {
    const item = library.find((entry) => entry.id === id);
    if (!item) return;
    const name = prompt("Name for the duplicate:", `${item.name} Copy`);
    if (!name) return;
    try {
      const now = new Date().toISOString();
      const restored = await restoreDocumentState(item.state);
      const copiedState = restored.state;
      copiedState.libraryId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      library.unshift({ id: copiedState.libraryId, name: name.trim(), format: copiedState.format, sender: copiedState.country, createdAt: now, modifiedAt: now, state: copiedState });
      storage.saveLibrary(library); renderLibrary();
    } catch (error) { alert(error.message || "That document could not be duplicated."); }
  }

  function duplicateCurrentDocument() {
    collectState();
    const existing = library.find((entry) => entry.id === state.libraryId);
    const name = prompt("Name for the duplicate:", `${existing?.name || state.header || formats.FORMATS[state.format].label} Copy`);
    if (!name) return;
    const now = new Date().toISOString();
    const copiedState = storage.normalize(storage.clone(state), config.defaultState, config);
    copiedState.libraryId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    state = copiedState;
    library.unshift({ id: state.libraryId, name: name.trim(), format: state.format, sender: state.country, createdAt: now, modifiedAt: now, state: storage.clone(state) });
    storage.saveLibrary(library);
    storage.saveLocal(state);
    renderLibrary();
    setStatus("Current document duplicated");
  }

  function renderLibrary() {
    const list = document.getElementById("libraryList");
    if (!library.length) { list.innerHTML = '<p class="empty-library">No local documents yet.</p>'; return; }
    list.replaceChildren(...library.map((item) => {
      const row = document.createElement("article"); row.className = "library-item"; row.dataset.id = item.id;
      const format = formats.FORMATS[item.format]?.label || "Diplomatic Letter";
      const sender = config.countries[item.sender]?.label || "Unknown sender";
      row.innerHTML = `<div><strong></strong><span>${format} · ${sender}</span><time>${new Date(item.modifiedAt).toLocaleString()}</time></div><div class="library-actions"><button class="button button-text" data-action="open">Open</button><button class="button button-text" data-action="duplicate">Duplicate</button><button class="button button-text" data-action="rename">Rename</button><button class="button button-text" data-action="delete">Delete</button></div>`;
      row.querySelector("strong").textContent = item.name;
      return row;
    }));
  }

  function resetState() { state = storage.normalize(config.defaultState, config.defaultState, config); visibilityTouched.clear(); populateForm(); storage.saveLocal(state); render(); }

  async function loadLetter(file) {
    try {
      const loaded = await storage.readJsonFile(file);
      if (![1, 2, 3, 4, 5, 6, 7, 8].includes(Number(loaded.version))) throw new Error("This save uses an unsupported version.");
      state = (await restoreDocumentState(loaded)).state; populateForm(); storage.saveLocal(state); await render(); setStatus("Saved document loaded");
      ["showCrest", "showSeal", "showDate"].forEach((key) => visibilityTouched.add(key));
    } catch (error) { alert(error.message || "That document could not be loaded."); }
  }

  document.getElementById("exportHeight").textContent = Math.round(1400 * window.AnbennarRenderer.BASE.height / window.AnbennarRenderer.BASE.width);

  countrySearch.addEventListener("focus", () => renderCountryResults(countrySearch.value));
  countrySearch.addEventListener("input", () => renderCountryResults(countrySearch.value));
  countrySearch.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); updateCountryActive(activeCountryIndex + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); updateCountryActive(activeCountryIndex - 1); }
    else if (event.key === "Enter" && activeCountryIndex >= 0) { event.preventDefault(); selectCountry(visibleCountries[activeCountryIndex].id); }
    else if (event.key === "Escape") closeCountryResults();
  });
  countryResults.addEventListener("click", (event) => { const button = event.target.closest("[data-country]"); if (button) selectCountry(button.dataset.country); });

  ["select", "keyup", "mouseup", "focus", "input"].forEach((eventName) => fields.body.addEventListener(eventName, rememberBodySelection));
  Object.entries(bodyFormatting).forEach(([style, button]) => {
    button.addEventListener("mousedown", (event) => { rememberBodySelection(); event.preventDefault(); });
    button.addEventListener("click", () => toggleInlineStyle(style));
  });
  fields.body.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== "b" && key !== "i") return;
    event.preventDefault();
    toggleInlineStyle(key === "b" ? "bold" : "italic");
  });

  form.addEventListener("input", (event) => {
    if (event.target.closest("#calendarPicker") || event.target.matches("input[type='file'], #countrySearch")) return;
    update();
  });
  form.addEventListener("change", (event) => {
    if (!event.target.matches("select")) return;
    if (event.target === fields.format) {
      collectState();
      state.template = "";
      state.currentPage = 0;
      applyNewDocumentVisibilityDefaults(formats.FORMATS[state.format] || formats.FORMATS.letter);
      populateTemplates();
      updateFormatUI();
    }
    const changedSealPairs = {
      sealCategory: "sealDesign",
      sealCategoryA: "sealDesignA",
      sealCategoryB: "sealDesignB"
    };
    const categoryKey = Object.keys(changedSealPairs).find((key) => event.target === fields[key]);
    if (categoryKey) {
      const designKey = changedSealPairs[categoryKey];
      const previousCategory = state[categoryKey];
      const previousDesign = state[designKey];
      if (previousCategory) sealSelectionMemory[designKey][previousCategory] = previousDesign;
      collectState();
      const remembered = sealSelectionMemory[designKey][state[categoryKey]];
      state[designKey] = syncSealDesignOptions(categoryKey, designKey, state[categoryKey], remembered ?? state[designKey]);
      fields[designKey].value = state[designKey];
      updateCustomSealActions();
    }
    if (event.target === fields.template) { applyTemplate(event.target.value); return; }
    update();
  });

  [fields.showDate, fields.showCrest, fields.showSeal, fields.showPageNumbers].forEach((button) => {
    button.addEventListener("click", toggleSwitch);
    button.addEventListener("mousedown", (event) => event.preventDefault());
  });

  calendarElements.trigger.addEventListener("click", () => {
    const open = calendarElements.picker.hidden; calendarElements.picker.hidden = !open; calendarElements.trigger.setAttribute("aria-expanded", String(open));
    if (open) renderCalendar();
  });
  calendarElements.previous.addEventListener("click", () => { state.date.month -= 1; if (state.date.month < 0) { state.date.month = 11; state.date.year -= 1; } renderCalendar(); scheduleSave(); render(); });
  calendarElements.next.addEventListener("click", () => { state.date.month += 1; if (state.date.month > 11) { state.date.month = 0; state.date.year += 1; } renderCalendar(); scheduleSave(); render(); });
  calendarElements.month.addEventListener("change", () => { state.date.month = Number(calendarElements.month.value); renderCalendar(); scheduleSave(); render(); });
  calendarElements.year.addEventListener("input", () => { state.date.year = Math.max(1, Number(calendarElements.year.value) || 1); renderCalendar(); scheduleSave(); render(); });
  calendarElements.days.addEventListener("click", (event) => { const button = event.target.closest(".calendar-day"); if (button) { state.date.day = Number(button.dataset.day); calendarElements.picker.hidden = true; renderCalendar(); scheduleSave(); render(); } });
  document.addEventListener("click", (event) => { if (!event.target.closest(".date-field")) calendarElements.picker.hidden = true; if (!event.target.closest(".combobox-field")) closeCountryResults(); });

  document.getElementById("crestUpload").addEventListener("change", handleCrestUpload);
  document.getElementById("clearCrestButton").addEventListener("click", () => { state.customCrest = null; state.customCrestName = ""; updateCrestStatus(); scheduleSave(); render(); });
  document.getElementById("resetPositioningButton").addEventListener("click", () => { state.positioning = storage.clone(config.defaultState.positioning); populateForm(); scheduleSave(); render(); });

  document.getElementById("previousPageButton").addEventListener("click", () => { state.currentPage = Math.max(0, state.currentPage - 1); render(); });
  document.getElementById("nextPageButton").addEventListener("click", () => { state.currentPage += 1; render(); });
  document.getElementById("exportButton").addEventListener("click", exportCurrent);
  document.getElementById("exportAllButton").addEventListener("click", exportAll);
  document.getElementById("saveButton").addEventListener("click", async () => {
    collectState();
    try { storage.downloadJson(await portableDocumentState(), `${baseFilename()}.json`); setStatus("Portable letter saved"); }
    catch (error) { alert(error.message || "The portable letter could not be saved."); }
  });
  document.getElementById("loadButton").addEventListener("click", () => document.getElementById("loadFile").click());
  document.getElementById("loadFile").addEventListener("change", (event) => { if (event.target.files[0]) loadLetter(event.target.files[0]); event.target.value = ""; });

  document.getElementById("saveLibraryButton").addEventListener("click", () => saveToLibrary(false));
  document.getElementById("saveAsLibraryButton").addEventListener("click", () => saveToLibrary(true));
  document.getElementById("duplicateCurrentButton").addEventListener("click", duplicateCurrentDocument);
  document.getElementById("myDocumentsButton").addEventListener("click", () => { renderLibrary(); libraryDialog.showModal(); });
  document.getElementById("closeLibraryButton").addEventListener("click", () => libraryDialog.close());
  document.getElementById("addCustomSealButton").addEventListener("click", () => openAddCustomSeal("sealDesign"));
  document.getElementById("manageCustomSealsButton").addEventListener("click", () => openCustomSealManager("sealDesign"));
  document.getElementById("addCustomSealAButton").addEventListener("click", () => openAddCustomSeal("sealDesignA"));
  document.getElementById("addCustomSealBButton").addEventListener("click", () => openAddCustomSeal("sealDesignB"));
  document.getElementById("manageTreatyCustomSealsButton").addEventListener("click", () => openCustomSealManager(state.sealCategoryA === "custom" ? "sealDesignA" : "sealDesignB"));
  document.getElementById("customSealEditorForm").addEventListener("submit", saveNewCustomSeal);
  document.getElementById("cancelCustomSealButton").addEventListener("click", () => { reopenManagerAfterAdd = false; customSealEditorDialog.close(); });
  document.getElementById("managerAddCustomSealButton").addEventListener("click", () => { customSealManagerDialog.close(); openAddCustomSeal(customSealTarget, true); });
  document.getElementById("closeCustomSealManagerButton").addEventListener("click", () => customSealManagerDialog.close());
  document.getElementById("customSealManagerList").addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    const row = event.target.closest("[data-id]");
    if (!action || !row) return;
    if (action.dataset.action === "rename") renameCustomSeal(row.dataset.id);
    if (action.dataset.action === "replace") { replacementSealId = row.dataset.id; document.getElementById("replaceCustomSealImage").click(); }
    if (action.dataset.action === "delete") deleteCustomSeal(row.dataset.id);
  });
  document.getElementById("replaceCustomSealImage").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || !replacementSealId) return;
    try {
      await customSeals.replaceImage(replacementSealId, file);
      await refreshCustomSealLibrary();
      renderCustomSealManager();
      await render();
      setStatus("Custom seal image replaced");
    } catch (error) { alert(error.message || "The custom seal image could not be replaced."); }
    finally { replacementSealId = ""; }
  });
  document.getElementById("newDocumentButton").addEventListener("click", () => { if (confirm("Start a new document? The current editor state will be replaced.")) resetState(); });
  document.getElementById("libraryList").addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]"); const row = event.target.closest("[data-id]"); if (!action || !row) return;
    const id = row.dataset.id; const item = library.find((entry) => entry.id === id); if (!item) return;
    if (action.dataset.action === "open") openLibraryDocument(id);
    if (action.dataset.action === "duplicate") duplicateLibraryDocument(id);
    if (action.dataset.action === "rename") { const name = prompt("Document name:", item.name); if (name) { item.name = name.trim(); item.modifiedAt = new Date().toISOString(); storage.saveLibrary(library); renderLibrary(); } }
    if (action.dataset.action === "delete" && confirm(`Delete "${item.name}" from My Documents?`)) { library = library.filter((entry) => entry.id !== id); storage.saveLibrary(library); renderLibrary(); }
  });

  const resetDialog = document.getElementById("resetDialog");
  document.getElementById("resetButton").addEventListener("click", () => resetDialog.showModal ? resetDialog.showModal() : (confirm("Reset this document?") && resetState()));
  resetDialog.addEventListener("close", () => { if (resetDialog.returnValue === "confirm") resetState(); });

  async function initializeApp() {
    initializeOptions();
    try {
      const restored = await restoreDocumentState(state);
      state = restored.state;
      if (restored.migrated) storage.saveLocal(state);
    } catch (error) {
      console.error(error);
      customSealStorageError = error.message || "Custom seal storage is unavailable.";
    }
    populateForm();
    renderLibrary();
    await render();
  }

  initializeApp();
})();
