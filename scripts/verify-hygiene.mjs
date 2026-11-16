import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());

const b64 = (s) => Buffer.from(s, "base64").toString("utf8");

const forbiddenPatterns = [
  new RegExp(b64("Y2hhc3Npcw=="), "i"),
  new RegExp(b64("aGFja2F0aG9uLWVudHJpZXM="), "i"),
  new RegExp(b64("aGFja2F0aG9uLXByb2plY3Rz"), "i"),
  new RegExp(b64("aGVlLw=="), "i"),
  new RegExp(b64("VkVORE9S")),
  new RegExp(b64("YXNzZW1ibHkgbWFuaWZlc3Q="), "i"),
  new RegExp(b64("VE9ETyhFTkdJTkUp")),
  new RegExp(b64("cnVuX3N3ZWVw")),
  new RegExp(b64("ZW5naW5lLWJ1aWxkaW5nLXByb21wdA=="), "i"),
  new RegExp(b64("d2lubmluZ19wcm9qZWN0X3BsYW4="), "i"),
  new RegExp(b64("c2NhZmZvbGQ="), "i"),
  new RegExp(b64("Ym9pbGVycGxhdGU="), "i"),
  new RegExp("\\b" + b64("RFAt") + "[A-Z0-9-]+\\b"),
  new RegExp("\\b" + b64("aG9uZXN0") + "\\w*", "i"),
  new RegExp("\\b" + b64("dHJpYWc=") + "\\w*", "i"),
];

function isSkippedPath(relPath) {
  const norm = relPath.split("\\").join("/");
  if (norm.startsWith("design_documents/") || norm === "design_documents") return true;
  if (norm.startsWith(".git/") || norm === ".git") return true;
  if (norm.startsWith("node_modules/") || norm === "node_modules") return true;
  if (norm.startsWith("dist/") || norm === "dist") return true;
  if (norm.startsWith(".env") && norm !== ".env.example") return true;
  return false;
}

function getFiles() {
  try {
    const raw = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
    });
    const entries = raw.split("\0").filter(Boolean);
    return entries.filter((p) => !isSkippedPath(p) && existsSync(join(root, p)));
  } catch {
    const out = [];
    function walk(dir, rel = "") {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const relChild = rel ? `${rel}/${name}` : name;
        if (isSkippedPath(relChild)) continue;
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full, relChild);
        } else if (st.isFile()) {
          out.push(relChild);
        }
      }
    }
    walk(root);
    return out;
  }
}

const files = getFiles();
let errors = 0;

for (const rel of files) {
  const full = join(root, rel);
  let content;
  try {
    const buf = readFileSync(full);
    if (buf.includes(0)) continue; // skip binary
    content = buf.toString("utf8");
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    for (let pIdx = 0; pIdx < forbiddenPatterns.length; pIdx++) {
      if (forbiddenPatterns[pIdx].test(line)) {
        console.error(`${rel}:${idx + 1} forbidden pattern matched [pattern-${pIdx + 1}]`);
        errors++;
      }
    }
  }
}

if (errors > 0) {
  console.error(`hygiene: fail (${errors} violation(s) found)`);
  process.exit(1);
} else {
  console.log(`hygiene: pass (${files.length} files scanned)`);
  process.exit(0);
}
