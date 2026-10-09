(function () {
  "use strict";

  const config = window.AnbennarConfig;
  const storage = window.AnbennarStorage;
  const calendar = window.AnbennarCalendar;
  const canvas = document.getElementById("letterCanvas");
  const renderer = new window.AnbennarRenderer.LetterRenderer(canvas, config);
  const form = document.getElementById("letterForm");
  const fields = {};
  const stateKeys = ["country", "surface", "header", "recipient", "body", "closing", "signatory", "title", "sealStyle", "showDate", "showCrest", "showSeal"];
  stateKeys.forEach((key) => { fields[key] = document.getElementById(key); });
  const calendarElements = {
    trigger: document.getElementById("datePickerButton"),
    value: document.getElementById("datePickerValue"),
    picker: document.getElementById("calendarPicker"),
    month: document.getElementById("calendarMonth"),
    year: document.getElementById("calendarYear"),
    days: document.getElementById("calendarDays"),
    previous: document.getElementById("previousMonth"),
    next: document.getElementById("nextMonth")
  };

  let state = storage.loadLocal(config.defaultState, config);
  let renderRequest = 0;
  let renderQueue = Promise.resolve();
  let saveTimer = null;

  function option(value, text) {
    const element = document.createElement("option");
    element.value = value;
    element.textContent = text;
    return element;
  }

  function initializeOptions() {
    Object.values(config.countries).forEach((country) => fields.country.appendChild(option(country.id, country.label)));
    Object.entries(config.surfaces).forEach(([id, surface]) => fields.surface.appendChild(option(id, surface.label)));
    Object.entries(config.seals).forEach(([id, seal]) => fields.sealStyle.appendChild(option(id, seal.label)));
    calendar.MONTHS.forEach((month, index) => calendarElements.month.appendChild(option(String(index), `${month.name} (${month.realName})`)));
  }

  function updateCrestStatus() {
    document.getElementById("crestFileName").textContent = state.customCrestName || "Using selected country's default crest";
    document.getElementById("clearCrestButton").disabled = !state.customCrest;
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
      const blank = document.createElement("span");
      blank.className = "calendar-blank";
      blank.setAttribute("aria-hidden", "true");
      calendarElements.days.appendChild(blank);
    }
    for (let day = 1; day <= dayCount; day += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "calendar-day";
      button.textContent = String(day);
      button.dataset.day = String(day);
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `${day} ${calendar.MONTHS[state.date.month].name} ${state.date.year}`);
      button.setAttribute("aria-selected", String(day === state.date.day));
      calendarElements.days.appendChild(button);
    }
  }

  function closeCalendar() {
    calendarElements.picker.hidden = true;
    calendarElements.trigger.setAttribute("aria-expanded", "false");
  }

  function toggleCalendar() {
    const willOpen = calendarElements.picker.hidden;
    calendarElements.picker.hidden = !willOpen;
    calendarElements.trigger.setAttribute("aria-expanded", String(willOpen));
    if (willOpen) {
      renderCalendar();
      requestAnimationFrame(() => calendarElements.picker.scrollIntoView({ block: "nearest" }));
    }
  }

  function setCalendarDate(partial, closeAfter = false) {
    state.date = calendar.clampDate({ ...state.date, ...partial }, config.defaultState.date);
    renderCalendar();
    scheduleSave();
    render();
    if (closeAfter) closeCalendar();
  }

  function stepMonth(direction) {
    let month = state.date.month + direction;
    let year = state.date.year;
    if (month < 0) { month = 11; year -= 1; }
    if (month > 11) { month = 0; year += 1; }
    setCalendarDate({ month, year: Math.max(1, year) });
  }

  function populateForm() {
    stateKeys.forEach((key) => {
      if (fields[key].matches("[role='switch']")) fields[key].setAttribute("aria-checked", String(Boolean(state[key])));
      else if (fields[key].type === "checkbox") fields[key].checked = Boolean(state[key]);
      else fields[key].value = state[key] ?? "";
    });
    renderCalendar();
    document.getElementById("crestUpload").value = "";
    updateCrestStatus();
  }

  function collectState() {
    stateKeys.forEach((key) => {
      if (fields[key].matches("[role='switch']")) state[key] = fields[key].getAttribute("aria-checked") === "true";
      else state[key] = fields[key].type === "checkbox" ? fields[key].checked : fields[key].value;
    });
    state.date = calendar.clampDate(state.date, config.defaultState.date);
  state.version = 4;
  }

  function setStatus(text) {
    document.getElementById("previewStatus").textContent = text;
  }

  function setFitMessage(fit) {
    const box = document.getElementById("fitMessage");
    const text = document.getElementById("fitMessageText");
    box.classList.remove("warning", "error");
    if (!fit.fits) {
      box.classList.add("error");
      text.textContent = "Letter is too long to fit on one page.";
      setStatus("Letter needs editing");
    } else if (fit.reduced) {
      box.classList.add("warning");
      text.textContent = "Letter fits using a slightly reduced body size.";
      setStatus("Document ready · text fitted");
    } else {
      text.textContent = "Letter fits comfortably on one page.";
      setStatus("Document ready");
    }
  }

  function render() {
    const request = ++renderRequest;
    const renderState = { ...state, date: { ...state.date } };
    renderQueue = renderQueue.catch(() => {}).then(async () => {
      try {
        const fit = await renderer.render(renderState);
        if (request === renderRequest) setFitMessage(fit);
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
      const saved = storage.saveLocal(state);
      document.getElementById("autosaveState").textContent = saved ? "Saved locally" : "Local save unavailable";
    }, 220);
  }

  function update() {
    collectState();
    scheduleSave();
    render();
  }

  function updateVisibilityToggle() {
    const editorScrollTop = form.scrollTop;
    update();
    // The desktop shell is viewport-locked, so only preserve the editor's
    // internal scroll position. Forcing document scroll here causes the page
    // to visibly jump whenever a visibility toggle is changed.
    form.scrollTop = editorScrollTop;
  }

  function toggleVisibilityButton(event) {
    const button = event.currentTarget;
    button.setAttribute("aria-checked", String(button.getAttribute("aria-checked") !== "true"));
    updateVisibilityToggle();
  }

  function sanitizeFilename(value, fallback) {
    const safe = String(value || "")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    return safe || fallback;
  }

  function baseFilename() {
    const country = config.countries[state.country]?.label || "Nation";
    const recipient = state.recipient.replace(/^\s*to\s+/i, "");
    return `Anbennar_Letter_${sanitizeFilename(country, "Nation")}_${sanitizeFilename(recipient, "Recipient")}`;
  }

  async function handleCrestUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      alert("Please choose a PNG, JPEG, or WebP image.");
      event.target.value = "";
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      alert("Please choose an image smaller than 6 MB.");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.customCrest = reader.result;
      state.customCrestName = file.name;
      updateCrestStatus();
      storage.saveLocal(state);
      render();
    };
    reader.readAsDataURL(file);
  }

  async function exportPng() {
    const button = document.getElementById("exportButton");
    button.disabled = true;
    button.textContent = "Preparing PNG…";
    setStatus("Rendering high-resolution PNG…");
    try {
      const blob = await renderer.exportBlob(state, 1400);
      storage.download(`${baseFilename()}.png`, blob);
      setStatus("PNG exported");
    } catch (error) {
      console.error(error);
      alert("The PNG could not be exported. Please try again.");
      setStatus("Export failed");
    } finally {
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0-12 4 4m-4-4L8 7M5 13v7h14v-7"/></svg> Export PNG';
      button.disabled = false;
    }
  }

  async function loadLetter(file) {
    try {
      const loaded = await storage.readJsonFile(file);
      if (![1, 2, 3, 4].includes(Number(loaded.version))) throw new Error("This save uses an unsupported version.");
      state = storage.normalize(loaded, config.defaultState, config);
      populateForm();
      storage.saveLocal(state);
      await render();
      setStatus("Saved letter loaded");
    } catch (error) {
      alert(error.message || "That letter could not be loaded.");
    }
  }

  function resetState() {
    state = JSON.parse(JSON.stringify(config.defaultState));
    populateForm();
    storage.saveLocal(state);
    render();
  }

  initializeOptions();
  populateForm();
  document.getElementById("exportHeight").textContent = Math.round(1400 * window.AnbennarRenderer.BASE.height / window.AnbennarRenderer.BASE.width);

  form.addEventListener("input", (event) => {
    if (event.target.closest("#calendarPicker") || event.target.matches("select, input[type='file']")) return;
    if (event.target.id === "showCrest" || event.target.id === "showSeal") updateVisibilityToggle(event);
    else update();
  });
  fields.showCrest.addEventListener("click", toggleVisibilityButton);
  fields.showSeal.addEventListener("click", toggleVisibilityButton);
  fields.showDate.addEventListener("click", toggleVisibilityButton);
  [fields.showDate, fields.showCrest, fields.showSeal].forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
  });
  form.addEventListener("change", (event) => {
    if (event.target.closest("#calendarPicker")) return;
    if (!event.target.matches("select")) return;
    if (event.target === fields.country) {
      state.customCrest = null;
      state.customCrestName = "";
      document.getElementById("crestUpload").value = "";
      updateCrestStatus();
    }
    update();
  });

  calendarElements.trigger.addEventListener("click", toggleCalendar);
  calendarElements.previous.addEventListener("click", () => stepMonth(-1));
  calendarElements.next.addEventListener("click", () => stepMonth(1));
  calendarElements.month.addEventListener("change", () => setCalendarDate({ month: Number(calendarElements.month.value) }));
  calendarElements.year.addEventListener("input", () => {
    const year = Number(calendarElements.year.value);
    if (Number.isFinite(year) && year >= 1) setCalendarDate({ year });
  });
  calendarElements.days.addEventListener("click", (event) => {
    const button = event.target.closest(".calendar-day");
    if (button) setCalendarDate({ day: Number(button.dataset.day) }, true);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".date-field")) closeCalendar();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !calendarElements.picker.hidden) {
      closeCalendar();
      calendarElements.trigger.focus();
    }
  });

  document.getElementById("crestUpload").addEventListener("change", handleCrestUpload);
  document.getElementById("clearCrestButton").addEventListener("click", () => {
    state.customCrest = null;
    state.customCrestName = "";
    document.getElementById("crestUpload").value = "";
    updateCrestStatus();
    storage.saveLocal(state);
    render();
  });
  document.getElementById("exportButton").addEventListener("click", exportPng);
  document.getElementById("saveButton").addEventListener("click", () => storage.downloadJson(state, `${baseFilename()}.json`));
  document.getElementById("loadButton").addEventListener("click", () => document.getElementById("loadFile").click());
  document.getElementById("loadFile").addEventListener("change", (event) => {
    if (event.target.files[0]) loadLetter(event.target.files[0]);
    event.target.value = "";
  });

  const resetDialog = document.getElementById("resetDialog");
  document.getElementById("resetButton").addEventListener("click", () => {
    if (typeof resetDialog.showModal === "function") resetDialog.showModal();
    else if (confirm("Reset this letter to the demo content?")) resetState();
  });
  resetDialog.addEventListener("close", () => { if (resetDialog.returnValue === "confirm") resetState(); });

  render();
})();
