const path = require("path");
const { spawnSync } = require("child_process");

// Compatibility entry point. The Python builder is authoritative because it
// recursively discovers physical assets and WebP-compresses the file:// bundle.
const builder = path.join(__dirname, "build-offline-export-assets.py");
const result = spawnSync(process.env.PYTHON || "python", [builder], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status || 0;
