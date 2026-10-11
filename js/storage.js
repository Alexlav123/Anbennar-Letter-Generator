(function () {
  "use strict";

  const STORAGE_KEY = "anbennar-letter-generator-v1";
  const LIBRARY_KEY = "anbennar-document-library-v2";
  const LEGACY_SEAL_CATEGORIES = Object.freeze({
    monarchy: "monarchy", republic: "republic", tribal: "tribal", runic: "runic",
    lotus: "sarhal", bulwar: "bulwari", bulwari: "bulwari", magocracy: "magocracy"
  });

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function normalizeSealSelection(raw, config, categoryKey, designKey, legacyKey, fallbackCategory, allowNone) {
    const explicitCategory = raw && Object.prototype.hasOwnProperty.call(raw, categoryKey) ? raw[categoryKey] : undefined;
    if (allowNone && explicitCategory === "") return { category: "", design: "1" };
    const legacyCategory = LEGACY_SEAL_CATEGORIES[String(raw?.[legacyKey] || "")] || "";
    const category = config.sealCategories[explicitCategory]
      ? explicitCategory
      : config.sealCategories[legacyCategory]
        ? legacyCategory
        : fallbackCategory;
    const requestedDesign = String(raw?.[designKey] || (config.sealCategories[category]?.dynamic ? "" : "1"));
    if (config.sealCategories[category]?.dynamic) return { category, design: requestedDesign };
    const designs = config.sealCategories[category]?.designs || ["1"];
    return { category, design: designs.includes(requestedDesign) ? requestedDesign : designs[0] };
  }

  function normalize(raw, defaults, config) {
    const next = { ...clone(defaults), ...(raw || {}) };
    next.version = 8;
    if (!window.AnbennarFormats.FORMATS[next.format]) next.format = "letter";
    if (!config.countries[next.country]) next.country = defaults.country;
    if (!config.surfaces[next.surface]) next.surface = defaults.surface;
    const primarySeal = normalizeSealSelection(raw, config, "sealCategory", "sealDesign", "sealStyle", defaults.sealCategory || "monarchy", false);
    const partyASeal = normalizeSealSelection(raw, config, "sealCategoryA", "sealDesignA", "sealStyleA", defaults.sealCategoryA || primarySeal.category, true);
    const partyBSeal = normalizeSealSelection(raw, config, "sealCategoryB", "sealDesignB", "sealStyleB", defaults.sealCategoryB || "", true);
    next.sealCategory = primarySeal.category;
    next.sealDesign = primarySeal.design;
    next.sealCategoryA = partyASeal.category;
    next.sealDesignA = partyASeal.design;
    next.sealCategoryB = partyBSeal.category;
    next.sealDesignB = partyBSeal.design;
    delete next.sealStyle;
    delete next.sealStyleA;
    delete next.sealStyleB;
    delete next.documentType;
    ["issuingAuthority", "header", "subtitle", "recipient", "parties", "preamble", "body", "deadline", "closing", "signatory", "title",
      "partyA", "representativeA", "representativeTitleA", "partyB", "representativeB", "representativeTitleB",
      "customCrestName", "template"].forEach((key) => {
      next[key] = typeof next[key] === "string" ? next[key] : defaults[key];
    });
    next.date = window.AnbennarCalendar.parseLegacy(raw?.date, defaults.date);
    next.showDate = Boolean(next.showDate);
    next.showCrest = raw && raw.showCrest !== undefined ? Boolean(raw.showCrest) : true;
    next.showSeal = raw && raw.showSeal !== undefined ? Boolean(raw.showSeal) : true;
    next.showPageNumbers = raw && raw.showPageNumbers !== undefined ? Boolean(raw.showPageNumbers) : true;
    next.customCrest = typeof next.customCrest === "string" && next.customCrest.startsWith("data:image/") ? next.customCrest : null;
    if (typeof raw?.customSeal === "string" && raw.customSeal.startsWith("data:image/")) {
      next.customSeal = raw.customSeal;
      next.customSealName = typeof raw.customSealName === "string" ? raw.customSealName : "";
    } else {
      delete next.customSeal;
      delete next.customSealName;
    }
    const position = raw?.positioning || {};
    next.positioning = {
      crestScale: Number.isFinite(Number(position.crestScale)) ? Number(position.crestScale) : 1,
      crestX: Number.isFinite(Number(position.crestX)) ? Number(position.crestX) : 0,
      crestY: Number.isFinite(Number(position.crestY)) ? Number(position.crestY) : 0,
      sealScale: Number.isFinite(Number(position.sealScale)) ? Number(position.sealScale) : 1,
      sealX: Number.isFinite(Number(position.sealX)) ? Number(position.sealX) : 0,
      sealY: Number.isFinite(Number(position.sealY)) ? Number(position.sealY) : 0
    };
    next.currentPage = Math.max(0, Math.trunc(Number(next.currentPage)) || 0);
    next.libraryId = typeof next.libraryId === "string" ? next.libraryId : null;
    if (Number(raw?.version) <= 5 && raw?.partyB === "Second Party" && !String(raw?.representativeB || "").trim()) {
      next.partyB = "";
      next.sealCategoryB = "";
      next.sealDesignB = "1";
    }
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
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch (error) { console.warn("Local state could not be saved.", error); return false; }
  }

  function loadLibrary() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) { console.warn("Document library could not be restored.", error); return []; }
  }

  function saveLibrary(items) {
    try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(items)); return true; }
    catch (error) { console.warn("Document library could not be saved.", error); return false; }
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

  window.AnbennarStorage = { loadLocal, saveLocal, normalize, loadLibrary, saveLibrary, download, downloadJson, readJsonFile, clone };
})();
