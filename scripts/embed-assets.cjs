const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const assetPaths = [];

for (const directory of ["assets/surfaces", "assets/crests", "assets/seals"]) {
  const absoluteDirectory = path.join(root, ...directory.split("/"));
  fs.readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp)$/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach((entry) => assetPaths.push(`${directory}/${entry.name}`));
}

function mimeType(assetPath) {
  const extension = path.extname(assetPath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

const entries = assetPaths.map((assetPath) => {
  const absolutePath = path.join(root, ...assetPath.split("/"));
  const data = fs.readFileSync(absolutePath).toString("base64");
  return `    ${JSON.stringify(assetPath)}: ${JSON.stringify(`data:${mimeType(assetPath)};base64,${data}`)}`;
});

const output = `(function () {\n  "use strict";\n\n  // Generated from the exact supplied PNG files. Run: node scripts/embed-assets.cjs\n  window.AnbennarEmbeddedAssets = Object.freeze({\n${entries.join(",\n")}\n  });\n})();\n`;

fs.writeFileSync(path.join(root, "js", "embedded-assets.js"), output, "utf8");
console.log(`Generated js/embedded-assets.js (${Buffer.byteLength(output).toLocaleString()} bytes)`);
