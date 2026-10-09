(function () {
  "use strict";

  const BASE = Object.freeze({ width: 1055, height: 1491 });
  const LAYOUT = Object.freeze({
    safeLeft: 138,
    safeRight: 138,
    crestTop: 62,
    crestWidth: 238,
    crestHeight: 238,
    dividerY: 318,
    titleY: 374,
    titleLetterSpacing: 3,
    recipientY: 459,
    bodyTop: 510,
    bodyBottom: 1055,
    signatureTop: 1130,
    signatureWidth: 505,
    sealX: 688,
    sealY: 1104,
    sealSize: 224,
    dateY: 1082,
    bodyFontMax: 34,
    bodyFontMin: 23,
    bodyLineHeightRatio: 1.42,
    paragraphGapRatio: .76
  });

  const CRESTLESS_LAYOUT = Object.freeze({
    ...LAYOUT,
    dividerY: 146,
    titleY: 202,
    recipientY: 284,
    bodyTop: 336
  });

  function layoutFor(state) {
    return state.showCrest === false ? CRESTLESS_LAYOUT : LAYOUT;
  }

  function versionedAssetUrl(source) {
    if (!source || /^(data:|blob:|https?:)/i.test(source)) return source;
    const runtime = window.AnbennarAssetRuntime || {};
    const version = runtime.version || "dev";
    return `${source}${source.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
  }

  function loadImage(source, mode = "physical") {
    return new Promise((resolve, reject) => {
      if (!source) return resolve(null);
      const embeddedSource = window.AnbennarEmbeddedAssets?.[source];
      const runtime = window.AnbennarAssetRuntime || {};
      const useEmbedded = mode === "embedded" || runtime.preferPhysical === false;
      const resolvedSource = useEmbedded && embeddedSource ? embeddedSource : versionedAssetUrl(source);
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${mode} asset: ${source.slice(0, 80)}`));
      image.src = resolvedSource;
    });
  }

  function drawContained(ctx, image, box) {
    if (!image) return null;
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = box.x + (box.width - width) / 2;
    const y = box.y + (box.height - height) / 2;
    ctx.drawImage(image, x, y, width, height);
    return { x, y, width, height };
  }

  function parseHexColor(value, fallback) {
    const match = String(value || "").trim().match(/^#([0-9a-f]{6})$/i);
    if (!match) return fallback;
    const hex = match[1];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }

  function drawEngraved(ctx, image, box, tint) {
    if (!image) return null;
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const x = box.x + (box.width - width) / 2;
    const y = box.y + (box.height - height) / 2;
    const work = document.createElement("canvas");
    work.width = width;
    work.height = height;
    const workCtx = work.getContext("2d");
    // Keep this entirely in canvas filter/compositing space so local file://
    // assets and uploaded crests follow the same safe rendering path.
    workCtx.filter = "grayscale(.82) saturate(.25) contrast(.92) brightness(1.04)";
    workCtx.drawImage(image, 0, 0, width, height);
    workCtx.filter = "none";
    const tintLayer = document.createElement("canvas");
    tintLayer.width = width;
    tintLayer.height = height;
    const tintCtx = tintLayer.getContext("2d");
    tintCtx.drawImage(image, 0, 0, width, height);
    tintCtx.globalCompositeOperation = "source-in";
    tintCtx.fillStyle = tint || "#5a5852";
    tintCtx.fillRect(0, 0, width, height);
    tintCtx.globalCompositeOperation = "source-over";

    // Two restrained offset passes create a shallow impressed edge without a
    // glossy highlight or a detached cast shadow.
    ctx.save();
    ctx.globalAlpha = .14;
    ctx.filter = "brightness(.45)";
    ctx.drawImage(work, x + 1, y + 1);
    ctx.globalAlpha = .10;
    ctx.filter = "brightness(1.55)";
    ctx.drawImage(work, x - .75, y - .75);
    ctx.filter = "none";
    ctx.globalAlpha = .82;
    ctx.drawImage(work, x, y);
    ctx.globalAlpha = .22;
    ctx.drawImage(tintLayer, x, y);
    ctx.restore();
    return { x, y, width, height };
  }

  function splitToken(ctx, token, maxWidth) {
    const parts = [];
    let part = "";
    for (const character of token) {
      const candidate = part + character;
      if (part && ctx.measureText(candidate).width > maxWidth) {
        parts.push(part);
        part = character;
      } else {
        part = candidate;
      }
    }
    if (part) parts.push(part);
    return parts;
  }

  function wrapParagraph(ctx, paragraph, maxWidth) {
    if (!paragraph.trim()) return [];
    const rawWords = paragraph.trim().split(/\s+/);
    const words = rawWords.flatMap((word) => ctx.measureText(word).width > maxWidth ? splitToken(ctx, word, maxWidth) : [word]);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function calculateBody(ctx, body, maxWidth, maxHeight, scale, fontFamily, fontWeight) {
    const fontMax = Math.round(LAYOUT.bodyFontMax * scale);
    const fontMin = Math.round(LAYOUT.bodyFontMin * scale);
    for (let fontSize = fontMax; fontSize >= fontMin; fontSize -= Math.max(1, Math.round(scale))) {
      ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}", Georgia, serif`;
      const paragraphs = String(body || "").replace(/\r/g, "").split("\n");
      const lineHeight = fontSize * LAYOUT.bodyLineHeightRatio;
      const paragraphGap = fontSize * LAYOUT.paragraphGapRatio;
      const blocks = paragraphs.map((paragraph) => wrapParagraph(ctx, paragraph, maxWidth));
      const lineCount = blocks.reduce((count, lines) => count + lines.length, 0);
      const gaps = Math.max(0, blocks.filter((lines) => lines.length).length - 1);
      const height = lineCount * lineHeight + gaps * paragraphGap;
      if (height <= maxHeight) return { blocks, fontSize, lineHeight, paragraphGap, height, fits: true, reduced: fontSize < fontMax };
    }
    ctx.font = `${fontWeight} ${fontMin}px "${fontFamily}", Georgia, serif`;
    const blocks = String(body || "").replace(/\r/g, "").split("\n").map((paragraph) => wrapParagraph(ctx, paragraph, maxWidth));
    const lineHeight = fontMin * LAYOUT.bodyLineHeightRatio;
    const paragraphGap = fontMin * LAYOUT.paragraphGapRatio;
    const lineCount = blocks.reduce((count, lines) => count + lines.length, 0);
    const gaps = Math.max(0, blocks.filter((lines) => lines.length).length - 1);
    return { blocks, fontSize: fontMin, lineHeight, paragraphGap, height: lineCount * lineHeight + gaps * paragraphGap, fits: false, reduced: true };
  }

  function measureSpacedText(ctx, text, letterSpacing = 0) {
    return ctx.measureText(text).width + Math.max(0, text.length - 1) * letterSpacing;
  }

  function drawCenteredSpacedText(ctx, text, centerX, y, letterSpacing) {
    const width = measureSpacedText(ctx, text, letterSpacing);
    let x = centerX - width / 2;
    for (const character of text) {
      ctx.fillText(character, x, y);
      x += ctx.measureText(character).width + letterSpacing;
    }
  }

  function fitSingleLine(ctx, text, family, weight, maxSize, minSize, maxWidth, letterSpacing = 0) {
    let size = maxSize;
    do {
      ctx.font = `${weight} ${size}px "${family}", Georgia, serif`;
      if (measureSpacedText(ctx, text, letterSpacing) <= maxWidth) return size;
      size -= 1;
    } while (size >= minSize);
    return minSize;
  }

  class LetterRenderer {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.cache = new Map();
      this.lastFit = { fits: true, reduced: false };
    }

    async image(source, mode = "physical") {
      if (!source) return null;
      const key = `${mode}:${source}`;
      if (!this.cache.has(key)) this.cache.set(key, loadImage(source, mode));
      return this.cache.get(key);
    }

    async preload(state, mode = "physical") {
      const country = this.config.countries[state.country] || this.config.countries.counts_league;
      const surface = this.config.surfaces[state.surface] || this.config.surfaces.parchment;
      const sealConfig = this.config.seals[state.sealStyle] || this.config.seals.monarchy;
      const bodyFont = surface.bodyFont || "EB Garamond Local";
      const headerFont = surface.headerFont || "Cinzel Local";
      const signatureFont = surface.signatureFont || bodyFont;
      const fontLoads = [
        document.fonts.load(`${surface.bodyWeight || 400} 24px "${bodyFont}"`),
        document.fonts.load(`${surface.headerWeight || 600} 24px "${headerFont}"`),
        document.fonts.load(`italic ${surface.signatureWeight || 600} 24px "${signatureFont}"`)
      ].map((promise) => promise.catch(() => []));
      await Promise.all([
        document.fonts.ready,
        ...fontLoads,
        this.image(surface.path, mode),
        this.image(sealConfig.path || this.config.assets.seal, mode),
        state.showCrest === false ? null : this.image(state.customCrest || country.crest, mode)
      ]);
    }

    async render(state, targetCanvas = this.canvas, outputWidth = BASE.width, options = {}) {
      const mode = options.assetMode || "physical";
      await this.preload(state, mode);
      const country = this.config.countries[state.country] || this.config.countries.counts_league;
      const surface = this.config.surfaces[state.surface] || this.config.surfaces.parchment;
      const sealConfig = this.config.seals[state.sealStyle] || this.config.seals.monarchy;
      const layout = layoutFor(state);
      const outputHeight = Math.round(outputWidth * BASE.height / BASE.width);
      const scale = outputWidth / BASE.width;
      targetCanvas.width = outputWidth;
      targetCanvas.height = outputHeight;
      const ctx = targetCanvas.getContext("2d");
      ctx.clearRect(0, 0, outputWidth, outputHeight);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const surfaceImage = await this.image(surface.path, mode);
      const seal = state.showSeal === false ? null : await this.image(sealConfig.path || this.config.assets.seal, mode);
      const crestSource = state.customCrest || country.crest;
      const crest = state.showCrest === false ? null : await this.image(crestSource, mode);

      drawContained(ctx, surfaceImage, { x: 0, y: 0, width: outputWidth, height: outputHeight });
      ctx.save();
      ctx.scale(scale, scale);
      const offsetY = Number(surface.contentOffsetY) || 0;
      const yAt = (value) => value + offsetY;
      const bodyFont = surface.bodyFont || "EB Garamond Local";
      const headerFont = surface.headerFont || "Cinzel Local";
      const signatureFont = surface.signatureFont || bodyFont;
      const bodyWeight = surface.bodyWeight || 400;
      const headerWeight = surface.headerWeight || 600;
      const signatureWeight = surface.signatureWeight || 600;
      const letterSpacing = surface.letterSpacing ?? layout.titleLetterSpacing;
      ctx.fillStyle = surface.inkColor;
      ctx.textBaseline = "alphabetic";

      if (state.showCrest !== false) {
        const crestBox = { x: (BASE.width - layout.crestWidth) / 2, y: yAt(layout.crestTop), width: layout.crestWidth, height: layout.crestHeight };
        if (surface.crestTreatment === "engraved") drawEngraved(ctx, crest, crestBox, surface.crestTint);
        else drawContained(ctx, crest, crestBox);
      }

      const center = BASE.width / 2;
      const lineWidth = 650;
      ctx.strokeStyle = surface.secondaryInkColor;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(center - lineWidth / 2, yAt(layout.dividerY));
      ctx.lineTo(center - 19, yAt(layout.dividerY));
      ctx.moveTo(center + 19, yAt(layout.dividerY));
      ctx.lineTo(center + lineWidth / 2, yAt(layout.dividerY));
      ctx.stroke();
      ctx.fillStyle = surface.secondaryInkColor;
      ctx.save();
      ctx.translate(center, yAt(layout.dividerY));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-7, -7, 14, 14);
      ctx.strokeStyle = surface.secondaryInkColor;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-11, -11, 22, 22);
      ctx.restore();

      ctx.beginPath();
      ctx.arc(center - 27, yAt(layout.dividerY), 2.3, 0, Math.PI * 2);
      ctx.arc(center + 27, yAt(layout.dividerY), 2.3, 0, Math.PI * 2);
      ctx.fill();

      const safeWidth = BASE.width - LAYOUT.safeLeft - LAYOUT.safeRight;
      const titleText = (state.header || "Correspondence").toUpperCase();
      const titleSize = fitSingleLine(ctx, titleText, headerFont, headerWeight, 43, 26, safeWidth, letterSpacing);
      ctx.font = `${headerWeight} ${titleSize}px "${headerFont}", Georgia, serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = surface.headerColor;
      drawCenteredSpacedText(ctx, titleText, center, yAt(layout.titleY), letterSpacing);

      const recipientText = state.recipient || "To whom it may concern,";
      const recipientSize = fitSingleLine(ctx, recipientText, bodyFont, bodyWeight, 31, 21, safeWidth);
      ctx.font = `${bodyWeight} ${recipientSize}px "${bodyFont}", Georgia, serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = surface.inkColor;
      ctx.fillText(recipientText, LAYOUT.safeLeft, yAt(layout.recipientY));

      const maxBodyHeight = layout.bodyBottom - layout.bodyTop;
      const bodyLayout = calculateBody(ctx, state.body, safeWidth, maxBodyHeight, 1, bodyFont, bodyWeight);
      this.lastFit = bodyLayout;
      ctx.font = `${bodyWeight} ${bodyLayout.fontSize}px "${bodyFont}", Georgia, serif`;
      let y = yAt(layout.bodyTop) + bodyLayout.fontSize;
      bodyLayout.blocks.forEach((lines, index) => {
        lines.forEach((line) => {
          if (y <= yAt(layout.bodyBottom)) ctx.fillText(line, LAYOUT.safeLeft, y);
          y += bodyLayout.lineHeight;
        });
        if (lines.length && index < bodyLayout.blocks.length - 1) y += bodyLayout.paragraphGap;
      });

      if (state.showDate && state.date) {
        ctx.textAlign = "right";
        ctx.font = `italic ${bodyWeight} 24px "${bodyFont}", Georgia, serif`;
        ctx.fillText(window.AnbennarCalendar.format(state.date), BASE.width - LAYOUT.safeRight, yAt(LAYOUT.dateY));
      }

      ctx.textAlign = "left";
      ctx.font = `italic ${signatureWeight} 29px "${signatureFont}", Georgia, serif`;
      ctx.fillText(state.closing || "By my hand,", LAYOUT.safeLeft, yAt(LAYOUT.signatureTop));
      const nameSize = fitSingleLine(ctx, state.signatory || "", signatureFont, signatureWeight, 47, 29, LAYOUT.signatureWidth);
      ctx.font = `italic ${signatureWeight} ${nameSize}px "${signatureFont}", Georgia, serif`;
      ctx.fillText(state.signatory || "", LAYOUT.safeLeft, yAt(LAYOUT.signatureTop + 59));
      const signatoryTitleSize = fitSingleLine(ctx, state.title || "", signatureFont, bodyWeight, 25, 19, LAYOUT.signatureWidth);
      ctx.font = `${bodyWeight} ${signatoryTitleSize}px "${signatureFont}", Georgia, serif`;
      ctx.fillText(state.title || "", LAYOUT.safeLeft, yAt(LAYOUT.signatureTop + 103));

      const signatureRuleY = yAt(LAYOUT.signatureTop + 142);
      ctx.strokeStyle = surface.secondaryInkColor;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(LAYOUT.safeLeft + 210, signatureRuleY);
      ctx.lineTo(LAYOUT.safeLeft + 440, signatureRuleY);
      ctx.stroke();
      ctx.save();
      ctx.translate(LAYOUT.safeLeft + 325, signatureRuleY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = surface.secondaryInkColor;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();

      if (state.showSeal !== false) {
        const scale = Number(sealConfig.scale) || 1;
        const size = LAYOUT.sealSize * scale;
        const offsetX = Number(sealConfig.offsetX) || 0;
        const offsetY = Number(sealConfig.offsetY) || 0;
        drawContained(ctx, seal, { x: LAYOUT.sealX + offsetX + (LAYOUT.sealSize - size) / 2, y: yAt(LAYOUT.sealY + offsetY) + (LAYOUT.sealSize - size) / 2, width: size, height: size });
      }
      ctx.restore();
      return this.lastFit;
    }

    async exportBlob(state, outputWidth = 1400) {
      const exportCanvas = document.createElement("canvas");
      const exportWithMode = (mode) => this.render(state, exportCanvas, outputWidth, { assetMode: mode }).then(() => new Promise((resolve, reject) => {
        try {
          exportCanvas.toBlob((blob) => {
            if (blob) return resolve(blob);
            try {
              const dataUrl = exportCanvas.toDataURL("image/png");
              const binary = atob(dataUrl.split(",")[1]);
              const bytes = new Uint8Array(binary.length);
              for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
              resolve(new Blob([bytes], { type: "image/png" }));
            } catch (fallbackError) {
              reject(new Error(`PNG conversion failed: ${fallbackError.message || fallbackError}`));
            }
          }, "image/png");
        } catch (error) {
          reject(new Error(`PNG conversion failed: ${error.message || error}`));
        }
      }));
      const embeddedAvailable = Boolean(window.AnbennarEmbeddedAssets);
      const offlineFile = window.location?.protocol === "file:";
      const modes = offlineFile && embeddedAvailable
        ? ["embedded", "physical"]
        : ["physical", "embedded"];
      let lastError;
      for (const mode of modes) {
        try {
          return await exportWithMode(mode);
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("PNG export failed.");
    }
  }

  window.AnbennarRenderer = { LetterRenderer, BASE, LAYOUT };
})();
