const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "js", "offline-export-assets.js"), "utf8"), sandbox);
const embedded = sandbox.window.AnbennarEmbeddedAssets || {};
const assetPaths = [];
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : /\.png$/i.test(entry.name) ? [absolute] : [];
  });
}
for (const directory of ["assets/surfaces", "assets/crests", "assets/seals"]) {
  assetPaths.push(...walk(path.join(root, directory)).map((asset) => path.relative(root, asset).replace(/\\/g, "/")));
}

const missing = [];
for (const assetPath of assetPaths) {
  const embeddedValue = embedded[assetPath];
  if (!embeddedValue || !/^data:image\/webp;base64,/.test(embeddedValue)) missing.push(assetPath);
}
const unexpected = Object.keys(embedded).filter((assetPath) => !assetPaths.includes(assetPath));

if (missing.length || unexpected.length) {
  console.error(JSON.stringify({ missing, unexpected }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Offline asset audit passed (${assetPaths.length} physical assets represented exactly once).`);
}
