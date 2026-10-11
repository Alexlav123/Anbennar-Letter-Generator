(function () {
  "use strict";

  const BASE = Object.freeze({ width: 1055, height: 1491 });
  const SAFE = Object.freeze({ left: 138, right: 138, bottom: 1345 });
  const SIGNATURE_TOP = 1130;
  const AUTHENTICATION_GAP = 40;
  function sealFor(config, state, slot = "") {
    const category = state[`sealCategory${slot}`];
    const design = state[`sealDesign${slot}`];
    return window.AnbennarCustomSeals.describe(config, category, design);
  }

  function versionedAssetUrl(source) {
    if (!source || /^(data:|blob:|https?:)/i.test(source)) return source;
    const version = window.AnbennarAssetRuntime?.version || "dev";
    return `${source}${source.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
  }

  async function loadImage(source, mode = "physical") {
    if (!source) return null;
    const embedded = window.AnbennarEmbeddedAssets?.[source];
    const resolved = mode === "embedded" && embedded ? embedded : versionedAssetUrl(source);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load asset: ${source}`));
      image.src = resolved;
    });
  }

  function containedRect(image, box) {
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
  }

  function drawContained(ctx, image, box) {
    if (!image) return;
    const rect = containedRect(image, box);
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }

  function drawEngraved(ctx, image, box, tint) {
    if (!image) return;
    const rect = containedRect(image, box);
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const work = document.createElement("canvas");
    work.width = width;
    work.height = height;
    const workCtx = work.getContext("2d");
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
    ctx.save();
    ctx.globalAlpha = .12;
    ctx.filter = "brightness(.45)";
    ctx.drawImage(work, rect.x + 1, rect.y + 1);
    ctx.globalAlpha = .08;
    ctx.filter = "brightness(1.55)";
    ctx.drawImage(work, rect.x - .75, rect.y - .75);
    ctx.filter = "none";
    ctx.globalAlpha = .82;
    ctx.drawImage(work, rect.x, rect.y);
    ctx.globalAlpha = .2;
    ctx.drawImage(tintLayer, rect.x, rect.y);
    ctx.restore();
  }

  function splitToken(ctx, token, maxWidth) {
    const parts = [];
    let part = "";
    for (const character of token) {
      const candidate = part + character;
      if (part && ctx.measureText(candidate).width > maxWidth) { parts.push(part); part = character; }
      else part = candidate;
    }
    if (part) parts.push(part);
    return parts;
  }

  function wrapParagraph(ctx, paragraph, maxWidth) {
    if (!paragraph.trim()) return [];
    const words = paragraph.trim().split(/\s+/).flatMap((word) => ctx.measureText(word).width > maxWidth ? splitToken(ctx, word, maxWidth) : [word]);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
      else line = candidate;
    });
    if (line) lines.push(line);
    return lines;
  }

  function appendStyledRun(runs, text, style = {}) {
    if (!text) return;
    const bold = Boolean(style.bold);
    const italic = Boolean(style.italic);
    const previous = runs[runs.length - 1];
    if (previous && previous.bold === bold && previous.italic === italic) previous.text += text;
    else runs.push({ text, bold, italic });
  }

  function parseInlineRuns(source) {
    const value = String(source || "");
    const runs = [];
    let plain = "";
    let index = 0;

    function flushPlain() { appendStyledRun(runs, plain); plain = ""; }
    function closingSingleAsterisk(from) {
      for (let cursor = from; cursor < value.length; cursor += 1) {
        if (value[cursor] === "*" && value[cursor - 1] !== "*" && value[cursor + 1] !== "*") return cursor;
      }
      return -1;
    }

    while (index < value.length) {
      if (value.startsWith("***", index)) {
        const close = value.indexOf("***", index + 3);
        if (close >= index + 3) {
          flushPlain();
          appendStyledRun(runs, value.slice(index + 3, close), { bold: true, italic: true });
          index = close + 3;
          continue;
        }
      }
      if (value.startsWith("**", index)) {
        const close = value.indexOf("**", index + 2);
        if (close >= index + 2) {
          flushPlain();
          appendStyledRun(runs, value.slice(index + 2, close), { bold: true });
          index = close + 2;
          continue;
        }
        if (index + 2 === value.length) {
          flushPlain();
          index += 2;
          continue;
        }
        plain += "**";
        index += 2;
        continue;
      }
      if (value[index] === "*") {
        const close = closingSingleAsterisk(index + 1);
        if (close >= index + 1) {
          flushPlain();
          appendStyledRun(runs, value.slice(index + 1, close), { italic: true });
          index = close + 1;
          continue;
        }
      }
      plain += value[index];
      index += 1;
    }
    flushPlain();
    return runs;
  }

  function runFont(base, run) {
    const style = run.italic ? "italic " : "";
    const weight = run.bold ? base.boldWeight : base.fontWeight;
    return `${style}${weight} ${base.fontSize}px "${base.fontFamily}", Georgia, serif`;
  }

  function measureRuns(ctx, runs, base) {
    return runs.reduce((width, run) => {
      ctx.font = runFont(base, run);
      return width + ctx.measureText(run.text).width;
    }, 0);
  }

  function styledWords(runs) {
    const words = [];
    let wordRuns = [];
    let spaceStyle = null;
    function finishWord() {
      if (!wordRuns.length) return;
      words.push({ runs: wordRuns, spaceStyle });
      wordRuns = [];
      spaceStyle = null;
    }
    runs.forEach((run) => {
      run.text.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          finishWord();
          spaceStyle = { bold: run.bold, italic: run.italic };
        } else appendStyledRun(wordRuns, part, run);
      });
    });
    finishWord();
    return words;
  }

  function wrapStyledParagraph(ctx, paragraph, maxWidth, base) {
    const parsed = parseInlineRuns(paragraph);
    if (!parsed.length) return [];
    if (parsed.every((run) => !run.bold && !run.italic)) {
      ctx.font = runFont(base, parsed[0]);
      return wrapParagraph(ctx, parsed.map((run) => run.text).join(""), maxWidth)
        .map((text) => ({ text, runs: [{ text, bold: false, italic: false }] }));
    }

    const lines = [];
    let lineRuns = [];
    let lineWidth = 0;
    function pushLine() {
      if (!lineRuns.length) return;
      const runs = lineRuns;
      lines.push({ text: runs.map((run) => run.text).join(""), runs });
      lineRuns = [];
      lineWidth = 0;
    }
    function appendToLine(text, style) {
      const run = { text, bold: Boolean(style.bold), italic: Boolean(style.italic) };
      appendStyledRun(lineRuns, text, run);
      ctx.font = runFont(base, run);
      lineWidth += ctx.measureText(text).width;
    }

    styledWords(parsed).forEach((word) => {
      const wordWidth = measureRuns(ctx, word.runs, base);
      const space = lineRuns.length ? { text: " ", ...(word.spaceStyle || {}) } : null;
      const spaceWidth = space ? measureRuns(ctx, [space], base) : 0;
      if (lineRuns.length && lineWidth + spaceWidth + wordWidth > maxWidth) pushLine();

      if (wordWidth <= maxWidth) {
        if (lineRuns.length) appendToLine(" ", word.spaceStyle || {});
        word.runs.forEach((run) => appendToLine(run.text, run));
        return;
      }

      if (lineRuns.length) pushLine();
      word.runs.forEach((run) => {
        for (const character of run.text) {
          ctx.font = runFont(base, run);
          const characterWidth = ctx.measureText(character).width;
          if (lineRuns.length && lineWidth + characterWidth > maxWidth) pushLine();
          appendToLine(character, run);
        }
      });
    });
    pushLine();
    return lines;
  }

  function measureSpacedText(ctx, text, spacing) {
    return ctx.measureText(text).width + Math.max(0, text.length - 1) * spacing;
  }

  function drawCenteredSpacedText(ctx, text, center, y, spacing) {
    let x = center - measureSpacedText(ctx, text, spacing) / 2;
    for (const character of text) {
      ctx.fillText(character, x, y);
      x += ctx.measureText(character).width + spacing;
    }
  }

  function fitSingleLine(ctx, text, family, weight, maxSize, minSize, maxWidth, spacing = 0) {
    for (let size = maxSize; size >= minSize; size -= 1) {
      ctx.font = `${weight} ${size}px "${family}", Georgia, serif`;
      if (measureSpacedText(ctx, text, spacing) <= maxWidth) return size;
    }
    return minSize;
  }

  function parseDocumentBlocks(value, detectArticles) {
    const lines = String(value || "").replace(/\r/g, "").split("\n");
    const blocks = [];
    let paragraph = [];
    let paragraphBlankBefore = 0;
    let blankLines = 0;
    let articleNumber = 0;
    let currentArticle = null;

    function pushBlock(type, text, blankBefore, extra = {}) {
      blocks.push({ type, text, blankBefore, article: currentArticle, ...extra });
    }

    function flushParagraph() {
      if (!paragraph.length) return;
      pushBlock("paragraph", paragraph.join(" "), paragraphBlankBefore);
      paragraph = [];
    }

    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        blankLines += 1;
        return;
      }
      if (/^\[\[pagebreak\]\]$/i.test(line)) {
        flushParagraph();
        blocks.push({ type: "pagebreak", text: "", blankBefore: 0, article: null });
        blankLines = 0;
        currentArticle = null;
        return;
      }
      const sectionMatch = line.match(/^##\s+(.+)$/);
      const articleHeading = detectArticles && /^Article\s+[IVXLCDM]+\b(?:\s*(?:—|–|-)\s*.*)?$/i.test(line);
      if (sectionMatch || articleHeading) {
        flushParagraph();
        if (articleHeading) currentArticle = `article-${++articleNumber}`;
        else currentArticle = null;
        pushBlock("heading", sectionMatch ? sectionMatch[1].trim() : line, blankLines, { headingKind: articleHeading ? "article" : "section" });
        blankLines = 0;
        return;
      }
      if (!paragraph.length) {
        paragraphBlankBefore = blankLines;
        blankLines = 0;
      }
      paragraph.push(line);
    });
    flushParagraph();
    return blocks;
  }

  function spacingForBlock(block, previous, paragraphGap) {
    if (!previous || previous.type === "pagebreak") return 0;
    if (block.headingKind === "deadline") return paragraphGap * 1.7;
    if (block.blankBefore >= 3) return paragraphGap * 2.1;
    if (block.blankBefore === 2) return paragraphGap * 1.65;
    if (block.blankBefore === 1) return paragraphGap;
    if (previous.type === "heading" && block.type === "paragraph") return paragraphGap * .55;
    return paragraphGap;
  }

  function blockContentHeight(block) {
    return block.lines.length * block.lineHeight;
  }

  function placedBlockHeight(block) {
    return blockContentHeight(block) + (Number(block.gapBefore) || 0);
  }

  function nextParagraphIndex(blocks, index) {
    for (let next = index + 1; next < blocks.length; next += 1) {
      if (blocks[next].type === "pagebreak" || blocks[next].type === "heading") return -1;
      if (blocks[next].type === "paragraph") return next;
    }
    return -1;
  }

  function sequenceHeight(blocks, start, stopAtHeading = true) {
    let height = 0;
    let first = true;
    for (let index = start; index < blocks.length; index += 1) {
      const block = blocks[index];
      if (block.type === "pagebreak" || (!first && stopAtHeading && block.type === "heading")) break;
      height += (first ? 0 : block.spacingBefore) + blockContentHeight(block);
      first = false;
    }
    return height;
  }

  function packDocumentForCapacities(blocks, capacities, options = {}) {
    const relaxed = Boolean(options.relaxed);
    const pages = capacities.map(() => ({ blocks: [], height: 0 }));
    const lastPageIndex = capacities.length - 1;
    const lastRenderableIndex = blocks.reduce((last, block, index) => block.type === "pagebreak" ? last : index, -1);
    let pageIndex = 0;

    function currentPage() { return pages[pageIndex]; }
    function moveToNextPage() {
      if (pageIndex >= lastPageIndex) return false;
      pageIndex += 1;
      return true;
    }
    function addPart(source, sourceIndex, lines, gapBefore, continued = false) {
      const part = { ...source, sourceIndex, lines: [...lines], gapBefore, continued };
      currentPage().blocks.push(part);
      currentPage().height += placedBlockHeight(part);
    }

    for (let sourceIndex = 0; sourceIndex < blocks.length; sourceIndex += 1) {
      const source = blocks[sourceIndex];
      if (source.type === "pagebreak") {
        if (sourceIndex > lastRenderableIndex) continue;
        if (currentPage().blocks.length && !moveToNextPage()) return null;
        continue;
      }

      if (source.type === "heading") {
        let page = currentPage();
        let capacity = capacities[pageIndex];
        let gap = page.blocks.length ? source.spacingBefore : 0;
        let remaining = capacity - page.height;
        const paragraphIndex = nextParagraphIndex(blocks, sourceIndex);
        const paragraph = paragraphIndex >= 0 ? blocks[paragraphIndex] : null;
        const keepLines = paragraph ? Math.min(relaxed ? 1 : 3, paragraph.lines.length) : 0;
        const keepHeight = gap + blockContentHeight(source) + (paragraph ? paragraph.spacingBefore + keepLines * paragraph.lineHeight : 0);
        const freshCapacity = capacities[Math.min(pageIndex + 1, lastPageIndex)];
        const sectionHeight = sequenceHeight(blocks, sourceIndex, true);
        const shouldKeepWhole = !relaxed && source.headingKind === "article"
          && sectionHeight <= freshCapacity
          && remaining < sectionHeight * .65
          && remaining <= capacity * .32;
        const headingHeight = blockContentHeight(source);
        const headingAndParagraphHeight = paragraph ? headingHeight + paragraph.spacingBefore + blockContentHeight(paragraph) : headingHeight;
        const shouldKeepParagraph = !relaxed && paragraph
          && headingAndParagraphHeight <= freshCapacity
          && remaining < headingAndParagraphHeight
          && remaining <= capacity * .25;
        const headingFitsHere = headingHeight + gap <= remaining;
        const headingFitsFresh = headingHeight <= freshCapacity;
        const keepStartFitsFresh = keepHeight - gap <= freshCapacity;
        const lastHeadingNeedsFinal = relaxed
          && sourceIndex === lastRenderableIndex
          && pageIndex === lastPageIndex - 1
          && page.blocks.length
          && headingFitsFresh;
        const softMove = (shouldKeepWhole || shouldKeepParagraph || keepHeight > remaining) && keepStartFitsFresh;

        if (page.blocks.length && ((!headingFitsHere && headingFitsFresh) || softMove || lastHeadingNeedsFinal)) {
          if (!moveToNextPage()) return null;
          page = currentPage();
          capacity = capacities[pageIndex];
          gap = 0;
          remaining = capacity;
        }
        if (blockContentHeight(source) + gap > remaining) return null;
        addPart(source, sourceIndex, source.lines, gap);
        continue;
      }

      const pending = [...source.lines];
      let firstFragment = true;
      const seenPositions = new Set();
      while (pending.length) {
        const positionKey = `${pageIndex}:${pending.length}:${firstFragment ? 1 : 0}`;
        if (seenPositions.has(positionKey)) {
          console.warn("Pagination fallback: forcing block split after non-progress detection.", { sourceIndex, pageIndex, remainingLines: pending.length });
          return null;
        }
        seenPositions.add(positionKey);
        const page = currentPage();
        const capacity = capacities[pageIndex];
        const gap = firstFragment && page.blocks.length ? source.spacingBefore : 0;
        const remaining = capacity - page.height;
        const wholeHeight = gap + pending.length * source.lineHeight;
        const previous = page.blocks[page.blocks.length - 1];
        const tetheredToHeading = firstFragment && previous?.type === "heading" && previous.sourceIndex === sourceIndex - 1;
        const mustReachFinal = sourceIndex === lastRenderableIndex && pageIndex < lastPageIndex;
        const freshCapacity = capacities[Math.min(pageIndex + 1, lastPageIndex)];

        if (wholeHeight <= remaining && !mustReachFinal) {
          addPart(source, sourceIndex, pending.splice(0), gap, !firstFragment);
          break;
        }
        if (!relaxed && !tetheredToHeading && page.blocks.length && pending.length * source.lineHeight <= freshCapacity) {
          if (!moveToNextPage()) return null;
          firstFragment = true;
          continue;
        }

        let availableLines = Math.max(0, Math.floor((remaining - gap) / source.lineHeight));
        const minimumHere = relaxed ? 1 : (tetheredToHeading ? Math.min(3, pending.length) : Math.min(2, pending.length));
        if (page.blocks.length && availableLines < minimumHere) {
          if (!moveToNextPage()) return null;
          firstFragment = true;
          continue;
        }
        if (!availableLines) return null;

        let lineCount = Math.min(availableLines, pending.length);
        if (mustReachFinal && pageIndex === lastPageIndex - 1) {
          const fitsFreshFinal = pending.length * source.lineHeight <= capacities[lastPageIndex];
          if (page.blocks.length && fitsFreshFinal && (relaxed || !tetheredToHeading)) {
            if (!moveToNextPage()) return null;
            firstFragment = true;
            continue;
          }
          const linesReservedForFinal = relaxed ? 1 : Math.min(2, Math.max(1, pending.length - minimumHere));
          lineCount = Math.min(lineCount, Math.max(minimumHere, pending.length - linesReservedForFinal));
        }
        if (pending.length - lineCount === 1 && lineCount > minimumHere) lineCount -= 1;
        if (lineCount < minimumHere && page.blocks.length) {
          if (!moveToNextPage()) return null;
          firstFragment = true;
          continue;
        }

        addPart(source, sourceIndex, pending.splice(0, lineCount), gap, !firstFragment);
        firstFragment = false;
        if (pending.length && !moveToNextPage()) return null;
      }
    }

    if (pageIndex !== lastPageIndex || !pages[lastPageIndex].blocks.length) return null;
    return pages;
  }

  function recalculatePageHeight(page) {
    page.blocks.forEach((block, index) => { if (index === 0) block.gapBefore = 0; });
    page.height = page.blocks.reduce((height, block) => height + placedBlockHeight(block), 0);
  }

  function forcePackBlocks(blocks, firstCapacity, continuationCapacity, singleFinalCapacity, multiFinalCapacity) {
    const pages = [{ blocks: [], height: 0 }];
    let pageIndex = 0;
    const capacityForPage = () => pageIndex === 0 ? firstCapacity : continuationCapacity;
    const currentPage = () => pages[pageIndex];
    const newPage = () => { pages.push({ blocks: [], height: 0 }); pageIndex += 1; };
    const place = (source, sourceIndex, lines, gapBefore, continued = false) => {
      const part = { ...source, sourceIndex, lines: [...lines], gapBefore, continued };
      currentPage().blocks.push(part);
      currentPage().height += placedBlockHeight(part);
    };

    blocks.forEach((source, sourceIndex) => {
      if (source.type === "pagebreak") {
        if (currentPage().blocks.length) newPage();
        return;
      }
      if (source.type === "heading") {
        let gap = currentPage().blocks.length ? source.spacingBefore : 0;
        if (currentPage().blocks.length && currentPage().height + gap + blockContentHeight(source) > capacityForPage()) {
          newPage();
          gap = 0;
        }
        place(source, sourceIndex, source.lines, gap);
        return;
      }

      const pending = [...source.lines];
      let firstFragment = true;
      while (pending.length) {
        const page = currentPage();
        const gap = firstFragment && page.blocks.length ? source.spacingBefore : 0;
        let availableLines = Math.floor((capacityForPage() - page.height - gap) / source.lineHeight);
        if (availableLines <= 0 && page.blocks.length) {
          newPage();
          continue;
        }
        if (availableLines <= 0) {
          console.warn("Pagination fallback: a line exceeds the usable page height; preserving it on its own page.", { sourceIndex, pageIndex });
          availableLines = 1;
        }
        const lineCount = Math.max(1, Math.min(availableLines, pending.length));
        place(source, sourceIndex, pending.splice(0, lineCount), gap, !firstFragment);
        firstFragment = false;
        if (pending.length) newPage();
      }
    });

    while (pages.length > 1 && !pages[pages.length - 1].blocks.length) pages.pop();
    const finalCapacity = pages.length === 1 ? singleFinalCapacity : multiFinalCapacity;
    const lastPage = pages[pages.length - 1];
    if (lastPage.height <= finalCapacity) return pages;

    const finalPage = { blocks: [], height: 0 };
    const trailingArticle = lastPage.blocks[lastPage.blocks.length - 1]?.article;
    let articleStart = -1;
    if (trailingArticle) {
      for (let index = lastPage.blocks.length - 1; index >= 0; index -= 1) {
        if (lastPage.blocks[index].article === trailingArticle && lastPage.blocks[index].type === "heading") { articleStart = index; break; }
      }
    }
    if (articleStart >= 0) {
      const articleBlocks = lastPage.blocks.slice(articleStart).map((block) => ({ ...block, lines: [...block.lines] }));
      articleBlocks[0].gapBefore = 0;
      const articleHeight = articleBlocks.reduce((height, block) => height + placedBlockHeight(block), 0);
      if (articleHeight <= multiFinalCapacity) {
        finalPage.blocks = articleBlocks;
        lastPage.blocks.splice(articleStart);
      }
    }

    if (!finalPage.blocks.length) {
      const trailing = lastPage.blocks[lastPage.blocks.length - 1];
      if (trailing?.type === "paragraph" && trailing.lines.length > 1) {
        const maximum = Math.max(1, Math.floor(multiFinalCapacity / trailing.lineHeight));
        const count = Math.min(trailing.lines.length - 1, Math.max(1, Math.min(2, maximum)));
        finalPage.blocks.push({ ...trailing, lines: trailing.lines.splice(-count), gapBefore: 0, continued: true });
      } else if (trailing) {
        finalPage.blocks.push({ ...trailing, lines: [...trailing.lines], gapBefore: 0 });
        lastPage.blocks.pop();
      }
    }

    recalculatePageHeight(lastPage);
    recalculatePageHeight(finalPage);
    if (!lastPage.blocks.length && pages.length > 1) pages.pop();
    if (finalPage.blocks.length) pages.push(finalPage);
    return pages.filter((page) => page.blocks.length);
  }

  function packBlocksForRoles(blocks, firstCapacity, continuationCapacity, singleFinalCapacity, multiFinalCapacity) {
    if (!blocks.some((block) => block.type !== "pagebreak")) return [{ blocks: [], height: 0 }];
    const renderedLineCount = blocks.reduce((count, block) => count + block.lines.length, 0);
    const maximumPages = Math.max(100, renderedLineCount + blocks.length + 2);
    for (let pageCount = 1; pageCount <= maximumPages; pageCount += 1) {
      const capacities = pageCount === 1
        ? [Math.min(firstCapacity, singleFinalCapacity)]
        : [firstCapacity, ...Array(Math.max(0, pageCount - 2)).fill(continuationCapacity), multiFinalCapacity];
      const pages = packDocumentForCapacities(blocks, capacities);
      if (pages) return pages;
    }
    console.warn("Pagination fallback: forcing block split after non-progress detection.");
    for (let pageCount = 1; pageCount <= maximumPages; pageCount += 1) {
      const capacities = pageCount === 1
        ? [Math.min(firstCapacity, singleFinalCapacity)]
        : [firstCapacity, ...Array(Math.max(0, pageCount - 2)).fill(continuationCapacity), multiFinalCapacity];
      const pages = packDocumentForCapacities(blocks, capacities, { relaxed: true });
      if (pages) return pages;
    }
    console.warn("Pagination fallback: using deterministic content-preserving page packing.");
    return forcePackBlocks(blocks, firstCapacity, continuationCapacity, singleFinalCapacity, multiFinalCapacity);
  }

  function configuredTreatyParties(state) {
    return [
      { slot: "A", party: state.partyA, name: state.representativeA, title: state.representativeTitleA },
      { slot: "B", party: state.partyB, name: state.representativeB, title: state.representativeTitleB }
    ].filter((item) => String(item.name || "").trim());
  }

  function resolvedIssuingAuthority(state, country) {
    return String(state.issuingAuthority || "").trim()
      || String(state.title || "").trim()
      || String(country?.label || "").trim();
  }

  function measureIdentity(state, format, surface, ctx, country) {
    const offsetY = Number(surface.contentOffsetY) || 0;
    const visual = format.visual || {};
    const hasCrest = state.showCrest !== false;
    const dividerY = (hasCrest ? visual.dividerWithCrest : visual.dividerWithoutCrest) + offsetY;
    const authorityText = visual.authorityLabel ? resolvedIssuingAuthority(state, country) : "";
    const authorityY = dividerY + 70;
    let titleY = dividerY + (visual.titleGap || 56);
    const bodyFont = surface.bodyFont || "EB Garamond Local";
    const configuredParties = [state.partyA, state.partyB].map((value) => String(value || "").trim()).filter(Boolean);
    const partyLine = state.parties || configuredParties.join(" and ");
    let preambleLines = [];
    let renderedBottom = titleY + 9;

    ctx.save();
    if (authorityText) {
      const headerFont = surface.headerFont || "Cinzel Local";
      const authoritySize = fitSingleLine(ctx, authorityText.toUpperCase(), headerFont, surface.headerWeight || 600, 23, 15, BASE.width - SAFE.left - SAFE.right, 0);
      ctx.font = `${surface.headerWeight || 600} ${authoritySize}px "${headerFont}", Georgia, serif`;
      const authorityMetrics = ctx.measureText(authorityText.toUpperCase());
      const authorityBottom = authorityY + (authorityMetrics.actualBoundingBoxDescent || authoritySize * .22);
      titleY = Math.max(titleY, Math.ceil(authorityBottom + 48));
    }
    const metaY = titleY + (visual.metaGap || 72);
    ctx.font = `${surface.bodyWeight || 400} 27px "${bodyFont}", Georgia, serif`;
    const metaText = format.showParties ? partyLine : format.showRecipient ? state.recipient : format.showSubtitle ? state.subtitle : "";
    if (metaText) {
      const metrics = ctx.measureText(metaText);
      renderedBottom = metaY + (metrics.actualBoundingBoxDescent || 6);
    }
    if (format.showPreamble && state.preamble) {
      ctx.font = `italic ${surface.bodyWeight || 400} 23px "${bodyFont}", Georgia, serif`;
      preambleLines = wrapParagraph(ctx, state.preamble, BASE.width - 250).slice(0, 3);
      if (preambleLines.length) {
        const lastBaseline = metaY + 42 + (preambleLines.length - 1) * 31;
        const lastMetrics = ctx.measureText(preambleLines[preambleLines.length - 1]);
        renderedBottom = lastBaseline + (lastMetrics.actualBoundingBoxDescent || 5);
      }
    }
    if (visual.authorityLabel) renderedBottom = Math.max(renderedBottom, titleY + 9);
    ctx.restore();

    const breathingRoom = visual.identity === "letter" ? 58 : visual.identity === "ultimatum" ? 46 : 38;
    return {
      visual,
      countryLabel: country?.label || "",
      authorityText,
      authorityY,
      dividerY,
      titleY,
      metaY,
      partyLine,
      preambleLines,
      firstBodyTop: Math.max(format.firstBodyTop ? Math.min(format.firstBodyTop + offsetY, renderedBottom + breathingRoom) : 0, Math.ceil(renderedBottom + breathingRoom))
    };
  }

  function textVisualBounds(ctx, text, baseline, fallbackSize) {
    const metrics = ctx.measureText(text || "M");
    return {
      top: baseline - (metrics.actualBoundingBoxAscent || fallbackSize * .78),
      bottom: baseline + (metrics.actualBoundingBoxDescent || fallbackSize * .22)
    };
  }

  function treatyAuthenticationLayout(state, format, surface, ctx, config) {
    if (!format.treatySignatures) return null;
    const offsetY = Number(surface.contentOffsetY) || 0;
    const bodyFont = surface.bodyFont || "EB Garamond Local";
    const signatureFont = surface.signatureFont || bodyFont;
    const parties = configuredTreatyParties(state).map((item) => ({
      ...item,
      sealConfig: (() => {
        const selected = sealFor(config, state, item.slot);
        return selected ? { ...selected, scale: (selected.scale || 1) * (format.visual?.sealScale || 1) } : null;
      })()
    }));
    const elements = [];
    const addText = (kind, text, baseline, fontSize, font) => {
      ctx.font = font;
      const bounds = textVisualBounds(ctx, text, baseline, fontSize);
      elements.push({ kind, ...bounds });
    };

    ctx.save();
    if (state.showDate && state.date) {
      addText("date", window.AnbennarCalendar.format(state.date), 994 + offsetY, 23,
        `italic ${surface.bodyWeight || 400} 23px "${bodyFont}", Georgia, serif`);
    }
    if (parties.length) {
      addText("signed-heading", format.visual?.authenticationLabel || "SIGNED AND SEALED", 1042 + offsetY, 18,
        `${surface.headerWeight || 600} 18px "${surface.headerFont || "Cinzel Local"}", Georgia, serif`);
      elements.push({ kind: "signed-rule", top: 1062 + offsetY, bottom: 1063 + offsetY });
    }

    const starts = { A: 135, B: 650 };
    const columns = parties.map((item) => {
      const x = starts[item.slot];
      const partyY = 1093 + offsetY;
      const titleY = 1172 + offsetY;
      const ruleY = 1204 + offsetY;
      const sealPlacement = { x: x + 67, y: 1220 + offsetY, size: 136 };
      const columnElements = [];
      const remember = (element) => { elements.push(element); columnElements.push(element); };
      if (item.party) {
        ctx.font = `${surface.bodyWeight || 400} 18px "${bodyFont}", Georgia, serif`;
        remember({ kind: `party-${item.slot}`, ...textVisualBounds(ctx, item.party, partyY, 18) });
      }
      const representativeY = (item.title ? 1140 : 1170) + offsetY;
      ctx.font = `italic ${surface.signatureWeight || 600} 36px "${signatureFont}", Georgia, serif`;
      remember({ kind: `representative-${item.slot}`, ...textVisualBounds(ctx, item.name, representativeY, 36) });
      if (item.title) {
        ctx.font = `${surface.bodyWeight || 400} 20px "${bodyFont}", Georgia, serif`;
        remember({ kind: `title-${item.slot}`, ...textVisualBounds(ctx, item.title, titleY, 20) });
      }
      remember({ kind: `signature-rule-${item.slot}`, top: ruleY, bottom: ruleY + 1 });

      const hasSeal = state.showSeal !== false && Boolean(item.sealConfig);
      if (hasSeal) {
        const position = state.positioning || {};
        const sealConfig = item.sealConfig || { scale: 1 };
        const scale = (Number(sealConfig.scale) || 1) * (Number(position.sealScale) || 1);
        const size = sealPlacement.size * scale;
        const top = sealPlacement.y + (sealPlacement.size - size) / 2 + (Number(sealConfig.offsetY) || 0) + (Number(position.sealY) || 0);
        remember({ kind: `seal-${item.slot}`, top, bottom: top + size });
      }
      return {
        ...item,
        x,
        partyY,
        representativeY,
        titleY,
        ruleY,
        sealPlacement,
        visualTop: columnElements.length ? Math.min(...columnElements.map((element) => element.top)) : SAFE.bottom
      };
    });
    ctx.restore();

    const top = elements.length ? Math.min(...elements.map((element) => element.top)) : SAFE.bottom;
    const bottom = elements.length ? Math.max(...elements.map((element) => element.bottom)) : 0;
    return { parties: columns, elements, top, bottom, dateY: 994 + offsetY, headingY: 1042 + offsetY, offsetY };
  }

  function singleAuthenticationLayout(state, layout, surface, ctx, config) {
    const offsetY = Number(surface.contentOffsetY) || 0;
    const bodyFont = surface.bodyFont || "EB Garamond Local";
    const signatureFont = surface.signatureFont || bodyFont;
    const elements = [];
    const lineY = SIGNATURE_TOP + 142 + offsetY;
    const hasTitle = Boolean(String(state.title || "").trim());
    const hasSignatory = Boolean(String(state.signatory || "").trim());
    const hasClosing = layout.closing && Boolean(String(state.closing || "").trim());
    const labelY = layout.label ? SIGNATURE_TOP - 5 + offsetY : null;
    const titleY = hasTitle ? SIGNATURE_TOP + 103 + offsetY : null;
    const signatoryY = hasSignatory ? (hasTitle ? SIGNATURE_TOP + 59 : SIGNATURE_TOP + 90) + offsetY : null;
    const closingY = hasClosing
      ? (hasSignatory ? signatoryY - 59 : hasTitle ? titleY - 44 : lineY - 44)
      : null;
    const addText = (kind, text, baseline, fontSize, font) => {
      ctx.font = font;
      elements.push({ kind, ...textVisualBounds(ctx, text, baseline, fontSize) });
    };

    ctx.save();
    if (state.showDate && state.date) {
      addText("date", window.AnbennarCalendar.format(state.date), 1082 + offsetY, 24,
        `italic ${surface.bodyWeight || 400} 24px "${bodyFont}", Georgia, serif`);
    }
    if (labelY !== null) {
      addText("authentication-label", layout.label, labelY, 17,
        `${surface.headerWeight || 600} 17px "${surface.headerFont || "Cinzel Local"}", Georgia, serif`);
    }
    if (closingY !== null) {
      addText("closing", state.closing, closingY, 29,
        `italic ${surface.signatureWeight || 600} 29px "${signatureFont}", Georgia, serif`);
    }
    if (signatoryY !== null) {
      addText("signatory", state.signatory, signatoryY, 43,
        `italic ${surface.signatureWeight || 600} 43px "${signatureFont}", Georgia, serif`);
    }
    if (titleY !== null) {
      addText("title", state.title, titleY, 24,
        `${surface.bodyWeight || 400} 24px "${signatureFont}", Georgia, serif`);
    }
    elements.push({ kind: "signature-rule", top: lineY, bottom: lineY + 1 });

    const selectedSeal = sealFor(config, state) || config.resolveSeal("monarchy", "1");
    const sealConfig = { ...selectedSeal, scale: (selectedSeal.scale || 1) * (layout.sealScale || 1) };
    const sealPlacement = { x: 688, y: 1104 + offsetY, size: 224 };
    if (state.showSeal !== false && Boolean(sealConfig)) {
      const position = state.positioning || {};
      const scale = (Number(sealConfig?.scale) || 1) * (Number(position.sealScale) || 1);
      const size = sealPlacement.size * scale;
      const top = sealPlacement.y + (sealPlacement.size - size) / 2 + (Number(sealConfig?.offsetY) || 0) + (Number(position.sealY) || 0);
      elements.push({ kind: "seal", top, bottom: top + size });
    }
    ctx.restore();

    const top = elements.length ? Math.min(...elements.map((element) => element.top)) : SAFE.bottom;
    const bottom = elements.length ? Math.max(...elements.map((element) => element.bottom)) : 0;
    return {
      kind: "single",
      elements,
      top,
      bottom,
      height: Math.max(0, bottom - top),
      dateY: 1082 + offsetY,
      labelY,
      label: layout.label,
      closingY,
      signatoryY,
      titleY,
      lineY,
      sealPlacement,
      sealConfig
    };
  }

  function measureFinalPageAuthentication(state, format, surface, ctx, config) {
    const layout = {
      kind: format.treatySignatures ? "treaty" : "single",
      closing: format.showClosing,
      label: format.visual?.authenticationLabel || "",
      sealScale: format.visual?.sealScale || 1
    };
    if (layout.kind === "treaty") {
      const authentication = treatyAuthenticationLayout(state, format, surface, ctx, config);
      return { ...authentication, kind: "treaty", height: Math.max(0, authentication.bottom - authentication.top) };
    }
    return singleAuthenticationLayout(state, layout, surface, ctx, config);
  }

  function drawIdentityDivider(ctx, center, y, surface, style) {
    ctx.strokeStyle = surface.secondaryInkColor;
    ctx.fillStyle = surface.secondaryInkColor;
    ctx.lineWidth = style === "heavy" ? 3 : 1.8;
    const drawLines = (lineY) => {
      ctx.beginPath();
      ctx.moveTo(center - 325, lineY); ctx.lineTo(center - 19, lineY);
      ctx.moveTo(center + 19, lineY); ctx.lineTo(center + 325, lineY); ctx.stroke();
    };
    drawLines(y);
    if (style === "double") {
      ctx.globalAlpha = .48;
      ctx.lineWidth = 1;
      drawLines(y + 7);
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(center, y);
    ctx.rotate(Math.PI / 4);
    const ornamentSize = style === "heavy" ? 9 : 7;
    ctx.fillRect(-ornamentSize, -ornamentSize, ornamentSize * 2, ornamentSize * 2);
    ctx.restore();
  }

  class LetterRenderer {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.cache = new Map();
      this.lastDocument = null;
    }

    async image(source, mode = "physical") {
      if (!source) return null;
      const key = `${mode}:${source}`;
      if (!this.cache.has(key)) this.cache.set(key, loadImage(source, mode));
      return this.cache.get(key);
    }

    async preload(state, mode) {
      const country = this.config.countries[state.country] || this.config.countries.counts_league;
      const surface = this.config.surfaces[state.surface] || this.config.surfaces.parchment;
      const [sealConfig, sealConfigA, sealConfigB] = await Promise.all([
        window.AnbennarCustomSeals.resolveSealAsset(this.config, state.sealCategory || "monarchy", state.sealDesign || "1"),
        window.AnbennarCustomSeals.resolveSealAsset(this.config, state.sealCategoryA, state.sealDesignA),
        window.AnbennarCustomSeals.resolveSealAsset(this.config, state.sealCategoryB, state.sealDesignB)
      ]);
      const fonts = [surface.bodyFont, surface.headerFont, surface.signatureFont].filter(Boolean);
      await Promise.all([
        document.fonts.ready,
        ...fonts.flatMap((font) => [
          document.fonts.load(`400 24px "${font}"`).catch(() => []),
          document.fonts.load(`600 24px "${font}"`).catch(() => []),
          document.fonts.load(`italic 400 24px "${font}"`).catch(() => []),
          document.fonts.load(`italic 600 24px "${font}"`).catch(() => [])
        ]),
        this.image(surface.path, mode),
        this.image(sealConfig?.source, mode),
        this.image(sealConfigA?.source, mode),
        this.image(sealConfigB?.source, mode),
        state.showCrest === false ? null : this.image(state.customCrest || country.crest, mode)
      ]);
    }

    prepare(state, ctx) {
      const surface = this.config.surfaces[state.surface] || this.config.surfaces.parchment;
      const format = window.AnbennarFormats.FORMATS[state.format] || window.AnbennarFormats.FORMATS.letter;
      const bodyFont = surface.bodyFont || "EB Garamond Local";
      const fontSize = 31;
      const lineHeight = fontSize * 1.42;
      const paragraphGap = fontSize * .76;
      const width = BASE.width - SAFE.left - SAFE.right;
      const rawBlocks = parseDocumentBlocks(state.body, format.treatySignatures);
      if (format.visual?.deadlineBlock && String(state.deadline || "").trim()) {
        rawBlocks.push(
          { type: "heading", text: "DEADLINE", blankBefore: 2, article: "deadline-block", headingKind: "deadline" },
          { type: "paragraph", text: String(state.deadline).trim(), blankBefore: 0, article: "deadline-block" }
        );
      }
      const blocks = rawBlocks.map((block, index) => {
        if (block.type === "pagebreak") return { ...block, lines: [], lineHeight: 0, fontSize: 0, spacingBefore: 0 };
        const sectionHeading = block.type === "heading" && block.headingKind === "section";
        const deadlineHeading = block.type === "heading" && block.headingKind === "deadline";
        const blockFontSize = sectionHeading ? 29 : deadlineHeading ? 22 : fontSize;
        const blockLineHeight = blockFontSize * (block.type === "heading" ? 1.38 : 1.42);
        const fontFamily = sectionHeading || deadlineHeading ? surface.headerFont || bodyFont : bodyFont;
        const fontWeight = block.type === "heading" ? surface.headerWeight || 600 : surface.bodyWeight || 400;
        const textStyle = { fontSize: blockFontSize, fontFamily, fontWeight, boldWeight: 600 };
        ctx.font = runFont(textStyle, { bold: false, italic: false });
        return {
          ...block,
          lines: wrapStyledParagraph(ctx, block.text, width, textStyle),
          lineHeight: blockLineHeight,
          fontSize: blockFontSize,
          fontFamily,
          fontWeight,
          boldWeight: 600,
          spacingBefore: spacingForBlock(block, rawBlocks[index - 1], paragraphGap)
        };
      }).filter((block) => block.type === "pagebreak" || block.lines.length);
      const offsetY = Number(surface.contentOffsetY) || 0;
      const country = this.config.countries[state.country] || this.config.countries.counts_league;
      const identity = measureIdentity(state, format, surface, ctx, country);
      const firstTop = identity.firstBodyTop;
      const continuationTop = format.continuationBodyTop + offsetY;
      const firstBottom = SAFE.bottom;
      const continuationBottom = SAFE.bottom;
      const finalAuthentication = measureFinalPageAuthentication(state, format, surface, ctx, this.config);
      const authenticationTop = finalAuthentication.top;
      const finalBodyBottom = authenticationTop >= SAFE.bottom
        ? SAFE.bottom
        : Math.max(continuationTop, authenticationTop - AUTHENTICATION_GAP);
      const firstFullCapacity = firstBottom - firstTop;
      const continuationCapacity = continuationBottom - continuationTop;
      const singleFinalCapacity = Math.max(0, finalBodyBottom - firstTop);
      const multiFinalCapacity = Math.max(0, finalBodyBottom - continuationTop);
      let pages = packBlocksForRoles(blocks, firstFullCapacity, continuationCapacity, singleFinalCapacity, multiFinalCapacity);
      if (!pages.length) pages = [{ blocks: [], height: 0 }];
      pages.forEach((page, index) => {
        page.role = pages.length === 1 ? "single" : index === 0 ? "first" : index === pages.length - 1 ? "final" : "continuation";
        page.bodyTop = index === 0 ? firstTop : continuationTop;
        page.bodyBottom = page.role === "single" || page.role === "final" ? finalBodyBottom : page.role === "first" ? firstBottom : continuationBottom;
      });
      return {
        pages,
        pageCount: pages.length,
        fontSize,
        lineHeight,
        paragraphGap,
        bodyFont,
        format,
        surface,
        identity,
        treatyIdentity: format.treatySignatures ? identity : null,
        finalAuthentication,
        treatyAuthentication: format.treatySignatures ? finalAuthentication : null,
        finalBodyBottom,
        authenticationPartyCount: format.treatySignatures ? configuredTreatyParties(state).length : 1
      };
    }

    drawIdentity(ctx, state, prepared, assets) {
      const { surface, format } = prepared;
      const identity = prepared.identity;
      const visual = identity.visual;
      const position = state.positioning || {};
      const offsetY = Number(surface.contentOffsetY) || 0;
      const center = BASE.width / 2;
      if (state.showCrest !== false) {
        const crestScale = (Number(position.crestScale) || 1) * (Number(surface.crestScale) || 1) * (Number(visual.crestScale) || 1);
        const size = (Number(visual.crestSize) || 238) * crestScale;
        const box = { x: center - size / 2 + (Number(position.crestX) || 0), y: (Number(visual.crestY) || 62) + offsetY + (Number(position.crestY) || 0), width: size, height: size };
        if (surface.crestTreatment === "engraved") drawEngraved(ctx, assets.crest, box, surface.crestTint);
        else drawContained(ctx, assets.crest, box);
      }
      drawIdentityDivider(ctx, center, identity.dividerY, surface, visual.divider);
      const headerFont = surface.headerFont || "Cinzel Local";
      const title = (state.header || format.label).toUpperCase();
      if (visual.authorityLabel) {
        ctx.textAlign = "center";
        ctx.fillStyle = surface.secondaryInkColor;
        ctx.font = `${surface.headerWeight || 600} 16px "${headerFont}", Georgia, serif`;
        drawCenteredSpacedText(ctx, visual.authorityLabel, center, identity.dividerY + 35, 2.2);
        const authority = identity.authorityText.toUpperCase();
        const authoritySize = fitSingleLine(ctx, authority, headerFont, surface.headerWeight || 600, 23, 15, BASE.width - SAFE.left - SAFE.right, 0);
        ctx.font = `${surface.headerWeight || 600} ${authoritySize}px "${headerFont}", Georgia, serif`;
        ctx.fillText(authority, center, identity.authorityY);
      }
      const titleY = identity.titleY;
      const maxSize = (format.prominentTitle ? 48 : 43) * (Number(visual.headerScale) || 1);
      const titleSize = fitSingleLine(ctx, title, headerFont, surface.headerWeight || 600, maxSize, 25, BASE.width - SAFE.left - SAFE.right, surface.letterSpacing ?? 3);
      ctx.font = `${surface.headerWeight || 600} ${titleSize}px "${headerFont}", Georgia, serif`;
      ctx.fillStyle = surface.headerColor;
      ctx.textAlign = "left";
      drawCenteredSpacedText(ctx, title, center, titleY, surface.letterSpacing ?? 3);
      const bodyFont = surface.bodyFont || "EB Garamond Local";
      ctx.fillStyle = surface.inkColor;
      ctx.font = `${surface.bodyWeight || 400} 27px "${bodyFont}", Georgia, serif`;
      let metaY = identity.metaY;
      if (format.showSubtitle && state.subtitle) { ctx.textAlign = "center"; ctx.fillText(state.subtitle, center, metaY); metaY += 54; }
      if (format.showRecipient && state.recipient) { ctx.textAlign = "left"; ctx.fillText(state.recipient, SAFE.left, metaY); }
      if (format.showParties) {
        ctx.textAlign = "center";
        const configuredParties = [state.partyA, state.partyB].map((value) => String(value || "").trim()).filter(Boolean);
        const partyLine = identity.partyLine || state.parties || configuredParties.join(" and ");
        if (partyLine) ctx.fillText(partyLine, center, metaY);
        if (format.showPreamble && state.preamble) {
          ctx.font = `italic ${surface.bodyWeight || 400} 23px "${bodyFont}", Georgia, serif`;
          const preambleLines = identity.preambleLines;
          preambleLines.forEach((line, index) => ctx.fillText(line, center, metaY + 42 + index * 31));
        }
      }
    }

    drawContinuationHeading(ctx, state, prepared, pageIndex) {
      const surface = prepared.surface;
      ctx.fillStyle = surface.headerColor;
      ctx.textAlign = "center";
      ctx.font = `${surface.headerWeight || 600} 19px "${surface.headerFont || "Cinzel Local"}", Georgia, serif`;
      ctx.fillText((state.header || prepared.format.label).toUpperCase(), BASE.width / 2, 118 + (Number(surface.contentOffsetY) || 0));
      ctx.strokeStyle = surface.secondaryInkColor;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(300, 143); ctx.lineTo(755, 143); ctx.stroke();
    }

    drawBody(ctx, page, prepared) {
      const surface = prepared.surface;
      ctx.textAlign = "left";
      let y = page.bodyTop;
      page.blocks.forEach((block) => {
        y += Number(block.gapBefore) || 0;
        const centered = block.headingKind === "deadline";
        ctx.fillStyle = block.headingKind === "section" || centered ? surface.headerColor : surface.inkColor;
        if (centered) {
          ctx.strokeStyle = surface.secondaryInkColor;
          ctx.globalAlpha = .66;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(SAFE.left + 80, y - 15); ctx.lineTo(BASE.width - SAFE.right - 80, y - 15); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        block.lines.forEach((line, index) => {
          const lineWidth = line.runs.reduce((width, run) => {
            ctx.font = runFont(block, run);
            return width + ctx.measureText(run.text).width;
          }, 0);
          let x = centered ? (BASE.width - lineWidth) / 2 : SAFE.left;
          line.runs.forEach((run) => {
            ctx.font = runFont(block, run);
            ctx.fillText(run.text, x, y + block.fontSize + index * block.lineHeight);
            x += ctx.measureText(run.text).width;
          });
        });
        y += block.lines.length * block.lineHeight;
      });
    }

    drawSignature(ctx, state, prepared, assets) {
      const surface = prepared.surface;
      const format = prepared.format;
      const bodyFont = surface.bodyFont || "EB Garamond Local";
      const signatureFont = surface.signatureFont || bodyFont;
      const offsetY = Number(surface.contentOffsetY) || 0;
      ctx.fillStyle = surface.inkColor;
      if (format.treatySignatures) {
        const authentication = prepared.treatyAuthentication;
        const parties = authentication.parties.map((item) => ({
          ...item,
          image: item.slot === "A" ? assets.sealA : assets.sealB,
          sealConfig: item.sealConfig || (item.slot === "A" ? assets.sealConfigA : assets.sealConfigB)
        }));
        if (state.showDate && state.date) {
          ctx.textAlign = "center";
          ctx.font = `italic ${surface.bodyWeight || 400} 23px "${bodyFont}", Georgia, serif`;
          ctx.fillText(window.AnbennarCalendar.format(state.date), BASE.width / 2, authentication.dateY);
        }
        if (parties.length) {
          const headingY = authentication.headingY;
          ctx.textAlign = "center";
          ctx.font = `${surface.headerWeight || 600} 18px "${surface.headerFont || "Cinzel Local"}", Georgia, serif`;
          drawCenteredSpacedText(ctx, format.visual?.authenticationLabel || "SIGNED AND SEALED", BASE.width / 2, headingY, 2.2);
          ctx.strokeStyle = surface.secondaryInkColor;
          ctx.globalAlpha = .72;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(345, headingY + 20); ctx.lineTo(710, headingY + 20); ctx.stroke();
          ctx.globalAlpha = 1;
        }
        const columnWidth = 270;
        parties.forEach((item) => {
          const x = item.x;
          ctx.textAlign = "left";
          if (item.party) {
            ctx.globalAlpha = .78;
            ctx.font = `${surface.bodyWeight || 400} 18px "${bodyFont}", Georgia, serif`;
            ctx.fillText(item.party, x, item.partyY);
            ctx.globalAlpha = 1;
          }
          ctx.font = `italic ${surface.signatureWeight || 600} 36px "${signatureFont}", Georgia, serif`;
          ctx.fillText(item.name, x, item.representativeY);
          if (item.title) {
            ctx.globalAlpha = .82;
            ctx.font = `${surface.bodyWeight || 400} 20px "${bodyFont}", Georgia, serif`;
            ctx.fillText(item.title, x, item.titleY);
            ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = surface.secondaryInkColor;
          ctx.globalAlpha = .7;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, item.ruleY); ctx.lineTo(x + columnWidth, item.ruleY); ctx.stroke();
          ctx.globalAlpha = 1;
          if (state.showSeal !== false && item.image) {
            this.drawSeal(ctx, item.image, state, item.sealConfig || { scale: 1 }, item.sealPlacement);
          }
        });
      } else {
        const authentication = prepared.finalAuthentication;
        ctx.textAlign = "left";
        if (authentication.labelY !== null) {
          ctx.textAlign = "center";
          ctx.font = `${surface.headerWeight || 600} 17px "${surface.headerFont || "Cinzel Local"}", Georgia, serif`;
          drawCenteredSpacedText(ctx, authentication.label, BASE.width / 2, authentication.labelY, 2);
          ctx.textAlign = "left";
        }
        if (authentication.closingY !== null) {
          ctx.font = `italic ${surface.signatureWeight || 600} 29px "${signatureFont}", Georgia, serif`;
          ctx.fillText(state.closing, SAFE.left, authentication.closingY);
        }
        if (authentication.signatoryY !== null) {
          ctx.font = `italic ${surface.signatureWeight || 600} 43px "${signatureFont}", Georgia, serif`;
          ctx.fillText(state.signatory, SAFE.left, authentication.signatoryY);
        }
        if (authentication.titleY !== null) {
          ctx.font = `${surface.bodyWeight || 400} 24px "${signatureFont}", Georgia, serif`;
          ctx.fillText(state.title, SAFE.left, authentication.titleY);
        }
        ctx.strokeStyle = surface.secondaryInkColor;
        ctx.beginPath(); ctx.moveTo(SAFE.left + 210, authentication.lineY); ctx.lineTo(SAFE.left + 440, authentication.lineY); ctx.stroke();
        if (state.showSeal !== false) this.drawSeal(ctx, assets.seal, state, authentication.sealConfig, authentication.sealPlacement);
      }
      if (!format.treatySignatures && state.showDate && state.date) {
        ctx.textAlign = "right";
        ctx.font = `italic ${surface.bodyWeight || 400} 24px "${bodyFont}", Georgia, serif`;
        ctx.fillText(window.AnbennarCalendar.format(state.date), BASE.width - SAFE.right, prepared.finalAuthentication.dateY);
      }
    }

    drawSeal(ctx, image, state, sealConfig, placement) {
      const position = state.positioning || {};
      const scale = (Number(sealConfig.scale) || 1) * (Number(position.sealScale) || 1);
      const size = placement.size * scale;
      const x = placement.x + (placement.size - size) / 2 + (Number(sealConfig.offsetX) || 0) + (Number(position.sealX) || 0);
      const y = placement.y + (placement.size - size) / 2 + (Number(sealConfig.offsetY) || 0) + (Number(position.sealY) || 0);
      drawContained(ctx, image, { x, y, width: size, height: size });
    }

    async render(state, targetCanvas = this.canvas, outputWidth = BASE.width, options = {}) {
      const mode = options.assetMode || "physical";
      await this.preload(state, mode);
      const measureCanvas = document.createElement("canvas");
      const prepared = this.prepare(state, measureCanvas.getContext("2d"));
      const requestedPage = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : Number(state.currentPage) || 0;
      const pageIndex = Math.max(0, Math.min(prepared.pageCount - 1, requestedPage));
      const page = prepared.pages[pageIndex];
      const country = this.config.countries[state.country] || this.config.countries.counts_league;
      const surface = prepared.surface;
      const [sealConfig, sealConfigA, sealConfigB] = await Promise.all([
        window.AnbennarCustomSeals.resolveSealAsset(this.config, state.sealCategory || "monarchy", state.sealDesign || "1"),
        window.AnbennarCustomSeals.resolveSealAsset(this.config, state.sealCategoryA, state.sealDesignA),
        window.AnbennarCustomSeals.resolveSealAsset(this.config, state.sealCategoryB, state.sealDesignB)
      ]);
      const outputHeight = Math.round(outputWidth * BASE.height / BASE.width);
      const scale = outputWidth / BASE.width;
      targetCanvas.width = outputWidth;
      targetCanvas.height = outputHeight;
      const ctx = targetCanvas.getContext("2d");
      const assets = {
        surface: await this.image(surface.path, mode),
        crest: state.showCrest === false ? null : await this.image(state.customCrest || country.crest, mode),
        seal: state.showSeal === false ? null : await this.image(sealConfig?.source, mode),
        sealA: state.showSeal === false || !sealConfigA ? null : await this.image(sealConfigA.source, mode),
        sealB: state.showSeal === false || !sealConfigB ? null : await this.image(sealConfigB.source, mode),
        sealConfig,
        sealConfigA,
        sealConfigB
      };
      ctx.clearRect(0, 0, outputWidth, outputHeight);
      drawContained(ctx, assets.surface, { x: 0, y: 0, width: outputWidth, height: outputHeight });
      ctx.save();
      ctx.scale(scale, scale);
      ctx.textBaseline = "alphabetic";
      if (pageIndex === 0) this.drawIdentity(ctx, state, prepared, assets);
      else this.drawContinuationHeading(ctx, state, prepared, pageIndex);
      this.drawBody(ctx, page, prepared);
      if (pageIndex === prepared.pageCount - 1) this.drawSignature(ctx, state, prepared, assets);
      if (prepared.pageCount > 1 && state.showPageNumbers !== false) {
        ctx.fillStyle = surface.secondaryInkColor;
        ctx.globalAlpha = .72;
        ctx.textAlign = "center";
        ctx.font = `400 18px "${surface.bodyFont || "EB Garamond Local"}", Georgia, serif`;
        ctx.fillText(`${pageIndex + 1} / ${prepared.pageCount}`, BASE.width / 2, 1425);
      }
      ctx.restore();
      this.lastDocument = prepared;
      return { pageCount: prepared.pageCount, currentPage: pageIndex, warning: prepared.pageCount > 6 };
    }

    async canvasBlob(canvas) {
      return new Promise((resolve, reject) => {
        try {
          canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG conversion returned no data.")), "image/png");
        } catch (error) { reject(error); }
      });
    }

    async exportPageBlob(state, pageIndex, outputWidth = 1400) {
      const canvas = document.createElement("canvas");
      const localFileExport = location.protocol === "file:";
      if (localFileExport && !window.AnbennarEmbeddedAssets) {
        throw new Error("Offline export assets are unavailable. Reload the page and try again.");
      }
      await this.render(state, canvas, outputWidth, {
        pageIndex,
        assetMode: localFileExport ? "embedded" : "physical"
      });
      return this.canvasBlob(canvas);
    }

    async exportAllBlobs(state, outputWidth = 1400) {
      const measureCanvas = document.createElement("canvas");
      const surface = this.config.surfaces[state.surface] || this.config.surfaces.parchment;
      const prepared = this.prepare(state, measureCanvas.getContext("2d"));
      const blobs = [];
      for (let index = 0; index < prepared.pageCount; index += 1) blobs.push(await this.exportPageBlob(state, index, outputWidth));
      return blobs;
    }

    exportBlob(state, outputWidth = 1400) { return this.exportPageBlob(state, Number(state.currentPage) || 0, outputWidth); }
  }

  window.AnbennarRenderer = { LetterRenderer, BASE };
})();
