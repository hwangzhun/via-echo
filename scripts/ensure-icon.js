/** Generate native and About icons from the user-provided logo. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, "logo/viaecho.svg");
const output = path.join(root, "src-tauri/icons");
const stamp = path.join(output, "source.sha256");
const hash = createHash("sha256").update(fs.readFileSync(source)).digest("hex");
const assets = ["icon.png", "icon.ico"];
if (!assets.every((name) => fs.existsSync(path.join(output, name))) ||
    !fs.existsSync(stamp) || fs.readFileSync(stamp, "utf8").trim() !== hash) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "viaecho-icons-"));
  try {
    const result = spawnSync(process.execPath, [path.join(root, "node_modules/@tauri-apps/cli/tauri.js"), "icon", source, "--output", temporary], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("viaecho icon generation failed");
    fs.mkdirSync(output, { recursive: true });
    for (const name of assets) fs.copyFileSync(path.join(temporary, name), path.join(output, name));
    fs.writeFileSync(stamp, `${hash}\n`);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
