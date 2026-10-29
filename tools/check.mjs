// Local pre-publish check. Run with: npm run check
// Fails if activities.json is broken, a listed activity file is missing, or any
// page in docs/activities/ is not a StatiCrypt-encrypted file.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { validateSettings } = require("../docs/assets/validate.js");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs");
const activitiesDir = join(docs, "activities");
const errors = [];
const warnings = [];

// 1. Settings file
let data;
try {
  data = JSON.parse(readFileSync(join(docs, "data", "activities.json"), "utf8"));
} catch (err) {
  errors.push(`docs/data/activities.json could not be read as JSON: ${err.message}`);
}

const referenced = new Set();
if (data) {
  const result = validateSettings(data);
  errors.push(...result.errors.map((e) => `activities.json: ${e}`));
  for (const a of data.activities || []) {
    if (!a || typeof a.path !== "string") continue;
    referenced.add(a.path);
    if (!existsSync(join(docs, a.path))) {
      const msg = `activities.json: "${a.id}" points to ${a.path}, which does not exist.`;
      (a.status === "available" ? errors : warnings).push(msg);
    }
  }
}

// 2. Everything published under docs/activities/
function isEncrypted(html) {
  return html.includes("staticryptConfig") && /"staticryptEncryptedMsgUniqueVariableName":"[0-9a-f]{64,}/.test(html);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

if (existsSync(activitiesDir)) {
  for (const file of walk(activitiesDir)) {
    const rel = relative(docs, file).split("\\").join("/");
    if (rel.endsWith(".html")) {
      if (!isEncrypted(readFileSync(file, "utf8"))) {
        errors.push(`${rel} is not a StatiCrypt-encrypted file. Never publish an original activity.`);
      }
      if (!referenced.has(rel)) warnings.push(`${rel} is published but not listed in activities.json.`);
    } else if (!name(rel).startsWith(".")) {
      warnings.push(`${rel} is a supporting file and is publicly readable. Confirm it contains no protected content.`);
    }
  }
}

function name(p) {
  return p.split("/").pop();
}

// 3. Files that should never be in the public repository
for (const forbidden of [".staticrypt.json", "originals", "protected-output", ".env"]) {
  if (existsSync(join(root, forbidden))) errors.push(`${forbidden} must not be inside the repository.`);
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length) {
  console.error(`\nCheck failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`Check passed${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.`);
