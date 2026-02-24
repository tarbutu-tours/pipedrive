const fs = require("fs");
const path = require("path");
const src = path.join(process.cwd(), "src", "ui");
const dest = path.join(process.cwd(), "dist", "ui");
if (fs.existsSync(src)) {
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}
