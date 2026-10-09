(function () {
  "use strict";

  const STORAGE_KEY = "anbennar-letter-generator-v1";

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(raw, defaults, config) {
    const next = { ...clone(defaults), ...(raw || {}) };
    next.version = 4;
    if (!config.countries[next.country]) next.country = defaults.country;
    if (!config.surfaces[next.surface]) next.surface = defaults.surface;
    if (!config.seals[next.sealStyle]) next.sealStyle = defaults.sealStyle || "monarchy";
    delete next.documentType;
    ["header", "recipient", "body", "closing", "signatory", "title", "customCrestName"].forEach((key) => {
      next[key] = typeof next[key] === "string" ? next[key] : defaults[key];
    });
    next.date = window.AnbennarCalendar.parseLegacy(raw?.date, defaults.date);
    next.showDate = Boolean(next.showDate);
    next.showCrest = raw && raw.showCrest !== undefined ? Boolean(raw.showCrest) : true;
    next.showSeal = raw && raw.showSeal !== undefined ? Boolean(raw.showSeal) : true;
    next.customCrest = typeof next.customCrest === "string" && next.customCrest.startsWith("data:image/") ? next.customCrest : null;
    return next;
  }

  function loadLocal(defaults, config) {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value ? normalize(JSON.parse(value), defaults, config) : clone(defaults);
    } catch (error) {
      console.warn("Local state could not be restored.", error);
      return clone(defaults);
    }
  }

  function saveLocal(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.warn("Local state could not be saved.", error);
      return false;
    }
  }

  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadJson(state, filename) {
    download(filename, new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
  }

  function readJsonFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(reader.result)); }
        catch (error) { reject(new Error("That file is not valid JSON.")); }
      };
      reader.onerror = () => reject(new Error("The selected file could not be read."));
      reader.readAsText(file);
    });
  }

  window.AnbennarStorage = { loadLocal, saveLocal, normalize, download, downloadJson, readJsonFile };
})();
