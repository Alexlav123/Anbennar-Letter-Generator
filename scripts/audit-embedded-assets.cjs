const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "js", "embedded-assets.js"), "utf8"), sandbox);
const embedded = sandbox.window.AnbennarEmbeddedAssets || {};
const assetPaths = [];
for (const directory of ["assets/surfaces", "assets/crests", "assets/seals"]) {
  assetPaths.push(...fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
    .map((entry) => `${directory}/${entry.name}`));
}

function hash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

const stale = [];
const missing = [];
for (const assetPath of assetPaths) {
  const physicalPath = path.join(root, ...assetPath.split("/"));
  const embeddedValue = embedded[assetPath];
  if (!embeddedValue) {
    missing.push(assetPath);
    continue;
  }
  const embeddedBuffer = Buffer.from(embeddedValue.split(",")[1], "base64");
  const physicalBuffer = fs.readFileSync(physicalPath);
  if (hash(embeddedBuffer) !== hash(physicalBuffer)) stale.push(assetPath);
}

if (missing.length || stale.length) {
  console.error(JSON.stringify({ missing, stale }, null, 2));
  process.exitCode = 1;
} else {
  console.log(`Embedded asset audit passed (${assetPaths.length} files match physical assets).`);
}
