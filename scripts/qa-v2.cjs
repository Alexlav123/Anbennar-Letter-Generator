const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const screenshotDirectory = process.env.QA_OUTPUT_DIR || os.tmpdir();
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".ttf": "font/ttf" };

function server() {
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const resolved = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!resolved.startsWith(root) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader("Content-Type", mime[path.extname(resolved).toLowerCase()] || "application/octet-stream");
    fs.createReadStream(resolved).pipe(response);
  });
}

(async () => {
  const appServer = server();
  await new Promise((resolve) => appServer.listen(0, "127.0.0.1", resolve));
  const port = appServer.address().port;
  const appUrl = process.argv.includes("--http")
    ? `http://127.0.0.1:${port}/index.html`
    : `file:///${path.join(root, "index.html").replace(/\\/g, "/")}`;
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("previewStatus").textContent.includes("ready"));

  const initial = await page.evaluate(() => ({
    canvas: [letterCanvas.width, letterCanvas.height],
    country: countrySearch.value,
    formatCount: format.options.length,
    materialCount: surface.options.length
  }));

  await page.fill("#countrySearch", "marr");
  await page.waitForSelector("#countryResults:not([hidden])");
  const searchMatches = await page.locator(".combobox-option").allTextContents();
  await page.keyboard.press("Enter");

  const formats = {};
  for (const id of ["letter", "decree", "treaty", "ultimatum", "contract"]) {
    await page.selectOption("#format", id);
    await page.waitForTimeout(60);
    formats[id] = await page.evaluate(() => ({
      recipient: Boolean(recipientField.offsetWidth),
      parties: Boolean(partiesField.offsetWidth),
      preamble: Boolean(preambleField.offsetWidth),
      deadline: Boolean(deadlineField.offsetWidth),
      treaty: Boolean(treatySignatures.offsetWidth),
      crest: showCrest.getAttribute("aria-checked") === "true"
    }));
  }

  const formatSamples = {
    letter: { header: "Formal Correspondence", recipient: "To the Lord of Marhold," },
    decree: { header: "Royal Decree", subtitle: "Let it be known throughout the realm" },
    treaty: { header: "Treaty of Friendship", parties: "Counts League and Marhold", preamble: "The named parties enter this compact in good faith." },
    ultimatum: { header: "Final Demand", recipient: "To the Council of Marhold,", deadline: "Before sunset on the 14th of Nerament" },
    contract: { header: "Founding Charter", parties: "Granted to the Company of the Thorn", preamble: "Under lawful authority, the following rights and duties are granted." }
  };
  const formatScreenshots = {};
  for (const [id, values] of Object.entries(formatSamples)) {
    await page.selectOption("#format", id);
    const crestShown = await page.getAttribute("#showCrest", "aria-checked") === "true";
    if ((id === "treaty" && crestShown) || (id !== "treaty" && !crestShown)) await page.click("#showCrest");
    for (const [field, value] of Object.entries(values)) await page.fill(`#${field}`, value);
    await page.fill("#body", "The terms recorded herein shall be observed in good faith by all named parties.\n\nThis instrument shall remain in force until lawfully amended or fulfilled.");
    await page.waitForTimeout(220);
    const screenshot = path.join(screenshotDirectory, `anbennar-format-${id}.png`);
    await page.locator("#letterCanvas").screenshot({ path: screenshot });
    formatScreenshots[id] = screenshot;
  }

  await page.click("#myDocumentsButton");
  page.once("dialog", (dialog) => dialog.accept("QA Draft"));
  await page.click("#saveAsLibraryButton");
  await page.waitForTimeout(80);
  const libraryAfterSave = await page.locator(".library-item").count();
  page.once("dialog", (dialog) => dialog.accept("QA Draft Copy"));
  await page.click("#duplicateCurrentButton");
  await page.waitForTimeout(80);
  const libraryAfterDuplicate = await page.locator(".library-item").count();
  await page.click("#closeLibraryButton");

  await page.selectOption("#sealCategory", "republic");
  await page.selectOption("#sealDesign", "4");
  const sealSelection = await page.evaluate(() => ({
    category: sealCategory.value,
    design: sealDesign.value,
    path: AnbennarConfig.resolveSeal(sealCategory.value, sealDesign.value).path
  }));
  await page.selectOption("#sealCategory", "custom");
  await page.click("#addCustomSealButton");
  await page.fill("#customSealName", "QA Custom Seal");
  await page.setInputFiles("#customSealImage", path.join(root, "assets", "seals", "republic", "4.png"));
  await page.click("#saveCustomSealButton");
  await page.waitForFunction(() => !customSealEditorDialog.open && sealDesign.value);
  const customSeal = await page.evaluate(() => ({ name: sealDesign.selectedOptions[0].textContent, category: sealCategory.value, id: sealDesign.value }));
  await page.$eval("#crestX", (input) => { input.value = "37"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.waitForTimeout(320);
  const positioning = await page.evaluate(() => AnbennarStorage.loadLocal(AnbennarConfig.defaultState, AnbennarConfig).positioning.crestX);
  const oldSave = await page.evaluate(() => {
    const normalized = AnbennarStorage.normalize({ version: 6, country: "counts_league", body: "Legacy text", sealStyle: "lotus", sealStyleA: "bulwar", sealStyleB: "runic" }, AnbennarConfig.defaultState, AnbennarConfig);
    return {
      format: normalized.format,
      body: normalized.body,
      primary: [normalized.sealCategory, normalized.sealDesign],
      partyA: [normalized.sealCategoryA, normalized.sealDesignA],
      partyB: [normalized.sealCategoryB, normalized.sealDesignB]
    };
  });

  await page.selectOption("#format", "treaty");
  await page.selectOption("#sealCategoryA", "sarhal");
  await page.selectOption("#sealDesignA", "3");
  await page.selectOption("#sealCategoryB", "");
  const treatySealSelection = await page.evaluate(() => ({
    categoryA: sealCategoryA.value,
    designA: sealDesignA.value,
    categoryB: sealCategoryB.value,
    designBDisabled: sealDesignB.disabled
  }));
  const longBody = Array.from({ length: 10 }, (_, index) => `Article ${index + 1}. The parties agree that this measured provision shall remain in force, shall be observed in good faith, and shall be recorded by their appointed representatives for the peace and prosperity of both realms.`).join("\n\n");
  await page.fill("#body", longBody);
  await page.waitForTimeout(700);
  const pagination = await page.evaluate(() => ({
    indicator: pageIndicator.textContent,
    navigationHidden: pageNavigation.hidden,
    fit: fitMessageText.textContent
  }));
  await page.click("#nextPageButton");
  await page.waitForTimeout(250);
  const nextPage = await page.locator("#pageIndicator").textContent();

  const exportCheck = await page.evaluate(async () => {
    const appCanvas = document.getElementById("letterCanvas");
    const testRenderer = new window.AnbennarRenderer.LetterRenderer(appCanvas, window.AnbennarConfig);
    const current = window.AnbennarStorage.loadLocal(window.AnbennarConfig.defaultState, window.AnbennarConfig);
    let normal;
    try { normal = { size: (await testRenderer.exportPageBlob(current, 0, 700)).size }; }
    catch (error) { normal = { error: error.message }; }
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = "assets/surfaces/parchment.png"; });
    const probe = document.createElement("canvas"); probe.width = 10; probe.height = 10;
    probe.getContext("2d").drawImage(image, 0, 0, 10, 10);
    let direct;
    try { direct = { size: (await new Promise((resolve) => probe.toBlob(resolve))).size }; }
    catch (error) { direct = { error: error.message }; }
    return { normal, direct };
  });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobile.on("pageerror", (error) => mobileErrors.push(error.message));
  await mobile.goto(appUrl, { waitUntil: "networkidle" });
  await mobile.click("#myDocumentsButton");
  const mobileState = await mobile.evaluate(() => ({
    dialogOpen: libraryDialog.open,
    formatVisible: Boolean(format.offsetWidth),
    exportVisible: Boolean(exportButton.offsetWidth),
    bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));

  await page.click("#nextPageButton");
  await page.waitForTimeout(180);
  const desktopScreenshot = path.join(screenshotDirectory, "anbennar-qa-desktop.png");
  const mobileScreenshot = path.join(screenshotDirectory, "anbennar-qa-mobile.png");
  await page.screenshot({ path: desktopScreenshot, fullPage: false });
  await mobile.screenshot({ path: mobileScreenshot, fullPage: false });

  console.log(JSON.stringify({ initial, searchMatches, formats, formatScreenshots, sealSelection, treatySealSelection, libraryAfterSave, libraryAfterDuplicate, customSeal, positioning, oldSave, pagination, nextPage, exportCheck, mobileState, errors, mobileErrors, screenshots: { desktopScreenshot, mobileScreenshot } }, null, 2));
  await browser.close();
  appServer.close();
})().catch((error) => { console.error(error); process.exitCode = 1; });
