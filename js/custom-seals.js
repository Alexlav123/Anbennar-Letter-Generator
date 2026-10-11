(function () {
  "use strict";

  const DATABASE_NAME = "AnbennarLetterGenerator";
  const STORE_NAME = "customSeals";
  const DATABASE_VERSION = 1;
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
  const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
  let databasePromise = null;
  let listCache = null;
  const recordCache = new Map();
  const urlCache = new Map();

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
  }

  function database() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error("Custom seal storage is not available in this browser.")); return; }
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("The custom seal library could not be opened."));
        request.onblocked = () => reject(new Error("The custom seal library is blocked by another open tab."));
      });
    }
    return databasePromise;
  }

  async function store(mode) {
    const db = await database();
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  function generateId() {
    if (crypto.randomUUID) return `custom_${crypto.randomUUID()}`;
    return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function validateName(name) {
    const value = String(name || "").trim();
    if (!value) throw new Error("Enter a name for the custom seal.");
    return value.slice(0, 120);
  }

  function validateBlob(blob) {
    if (!(blob instanceof Blob) || !ACCEPTED_TYPES.has(blob.type)) throw new Error("Choose a PNG, JPEG, or WebP image.");
    if (!blob.size) throw new Error("The selected image is empty.");
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("Choose an image smaller than 10 MB.");
    return blob;
  }

  async function digest(blob) {
    if (!crypto.subtle) return `${blob.type}:${blob.size}`;
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  function clearCaches(id, imageChanged = false) {
    listCache = null;
    recordCache.delete(id);
    if (imageChanged && urlCache.has(id)) {
      URL.revokeObjectURL(urlCache.get(id).url);
      urlCache.delete(id);
    }
  }

  async function list(force = false) {
    if (!force && listCache) return listCache.slice();
    const records = await requestResult((await store("readonly")).getAll());
    records.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
    records.forEach((record) => recordCache.set(record.id, record));
    listCache = records;
    return records.slice();
  }

  async function get(id) {
    if (!id) return null;
    if (recordCache.has(id)) return recordCache.get(id);
    const record = await requestResult((await store("readonly")).get(id));
    if (record) recordCache.set(id, record);
    return record || null;
  }

  async function put(record, imageChanged = false) {
    await requestResult((await store("readwrite")).put(record));
    clearCaches(record.id, imageChanged);
    recordCache.set(record.id, record);
    return record;
  }

  async function add(name, image, requestedId = "") {
    const blob = validateBlob(image);
    const now = new Date().toISOString();
    const record = {
      id: requestedId || generateId(),
      name: validateName(name),
      blob,
      mimeType: blob.type,
      hash: await digest(blob),
      createdAt: now,
      updatedAt: now,
      imageUpdatedAt: now
    };
    return put(record, true);
  }

  async function rename(id, name) {
    const record = await get(id);
    if (!record) throw new Error("That custom seal no longer exists.");
    return put({ ...record, name: validateName(name), updatedAt: new Date().toISOString() }, false);
  }

  async function replaceImage(id, image) {
    const record = await get(id);
    if (!record) throw new Error("That custom seal no longer exists.");
    const blob = validateBlob(image);
    const now = new Date().toISOString();
    return put({ ...record, blob, mimeType: blob.type, hash: await digest(blob), updatedAt: now, imageUpdatedAt: now }, true);
  }

  async function remove(id) {
    await requestResult((await store("readwrite")).delete(id));
    clearCaches(id, true);
  }

  function objectUrl(record) {
    if (!record?.blob) return null;
    const cached = urlCache.get(record.id);
    const revision = record.imageUpdatedAt || record.hash || record.updatedAt;
    if (cached?.revision === revision) return cached.url;
    if (cached) URL.revokeObjectURL(cached.url);
    const url = URL.createObjectURL(record.blob);
    urlCache.set(record.id, { revision, url });
    return url;
  }

  function describe(config, category, design) {
    if (!category) return null;
    if (category !== "custom") return config.resolveSeal(category, design);
    return { category: "custom", design: String(design || ""), label: "Custom seal", path: null, scale: 1, custom: true };
  }

  async function resolveSealAsset(config, category, design) {
    const descriptor = describe(config, category, design);
    if (!descriptor || !descriptor.custom) return descriptor ? { ...descriptor, source: descriptor.path, missing: false } : null;
    const record = await get(descriptor.design);
    if (!record) return { ...descriptor, source: null, missing: true };
    return { ...descriptor, label: record.name, source: objectUrl(record), updatedAt: record.updatedAt, missing: false };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("The custom seal image could not be read."));
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(data) {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i.exec(String(data || ""));
    if (!match) throw new Error("An embedded custom seal has invalid image data.");
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1].toLowerCase() });
  }

  async function exportPortable(ids) {
    const output = [];
    for (const id of [...new Set(ids.filter(Boolean))]) {
      const record = await get(id);
      if (!record) continue;
      output.push({ id: record.id, name: record.name, mimeType: record.mimeType, data: await blobToDataUrl(record.blob), createdAt: record.createdAt, updatedAt: record.updatedAt, imageUpdatedAt: record.imageUpdatedAt });
    }
    return output;
  }

  async function importPortable(items) {
    const remap = new Map();
    if (!Array.isArray(items)) return remap;
    for (const item of items) {
      if (!item || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.data !== "string") continue;
      const blob = validateBlob(dataUrlToBlob(item.data));
      const hash = await digest(blob);
      const existing = await get(item.id);
      if (existing) {
        const existingHash = existing.hash || await digest(existing.blob);
        if (existingHash === hash) { remap.set(item.id, item.id); continue; }
      }
      const id = existing ? generateId() : item.id;
      const now = new Date().toISOString();
      await put({ id, name: validateName(item.name), blob, mimeType: blob.type, hash, createdAt: item.createdAt || now, updatedAt: item.updatedAt || now, imageUpdatedAt: item.imageUpdatedAt || item.updatedAt || now }, true);
      remap.set(item.id, id);
    }
    return remap;
  }

  function legacyName(filename) {
    const clean = String(filename || "").trim().replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
    return clean || "Imported Custom Seal";
  }

  async function migrateLegacyState(input) {
    if (!input || typeof input.customSeal !== "string" || !input.customSeal.startsWith("data:image/")) return { state: input, migrated: false };
    const state = { ...input };
    const name = legacyName(state.customSealName);
    const blob = dataUrlToBlob(state.customSeal);
    const hash = await digest(blob);
    const record = (await list()).find((item) => item.hash === hash && item.name === name) || await add(name, blob);
    state.sealCategory = "custom";
    state.sealDesign = record.id;
    if (state.format === "treaty") {
      if (state.sealCategoryA !== "") { state.sealCategoryA = "custom"; state.sealDesignA = record.id; }
      if (state.sealCategoryB !== "") { state.sealCategoryB = "custom"; state.sealDesignB = record.id; }
    }
    delete state.customSeal;
    delete state.customSealName;
    return { state, migrated: true, record };
  }

  window.AnbennarCustomSeals = Object.freeze({
    MAX_IMAGE_BYTES,
    list,
    get,
    add,
    rename,
    replaceImage,
    remove,
    objectUrl,
    describe,
    resolveSealAsset,
    exportPortable,
    importPortable,
    migrateLegacyState,
    generateId
  });
})();
