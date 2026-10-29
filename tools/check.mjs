// Local pre-publish check. Run with: npm run check
// Fails if activities.json is broken, a listed activity file is missing, any page in
// docs/activities/ is not a StatiCrypt-encrypted file with the site's security settings,
// another page is published, or an unencrypted original is anywhere in the repository.
import { execFileSync } from "node:child_process";
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

const hasPolicy = (html) => /<meta\s+http-equiv="Content-Security-Policy"\s+content="default-src 'none';/.test(html);
const salts = new Map();

function checkEncryptedPage(rel, html) {
  if (!/"isRememberEnabled":false/.test(html)) {
    errors.push(`${rel} lets browsers remember the code. Re-encrypt it with tools/encrypt-activity.sh.`);
  }
  if (!hasPolicy(html)) {
    errors.push(`${rel} has no Content-Security-Policy. Re-encrypt it with tools/encrypt-activity.sh.`);
  }
  const salt = (html.match(/"staticryptSaltUniqueVariableName":"([0-9a-f]+)"/) || [])[1];
  if (salt && salts.has(salt)) warnings.push(`${rel} shares its salt with ${salts.get(salt)}. Re-encrypt one of them.`);
  else if (salt) salts.set(salt, rel);
}

function walk(dir, skip = []) {
  return readdirSync(dir).flatMap((name) => {
    if (skip.includes(name)) return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, skip) : [full];
  });
}

if (existsSync(activitiesDir)) {
  for (const file of walk(activitiesDir)) {
    const rel = relative(docs, file).split("\\").join("/");
    if (/\.html?$/i.test(rel)) {
      const html = readFileSync(file, "utf8");
      if (!isEncrypted(html)) {
        errors.push(`${rel} is not a StatiCrypt-encrypted file. Never publish an original activity.`);
      } else {
        checkEncryptedPage(rel, html);
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

// 3. Other published pages: only the homepage, with its security policy
for (const file of walk(docs)) {
  const rel = relative(docs, file).split("\\").join("/");
  if (!/\.html?$/i.test(rel) || rel.startsWith("activities/")) continue;
  if (rel !== "index.html") {
    errors.push(`docs/${rel} is published but is not the homepage or an encrypted activity. Remove it.`);
  } else if (!hasPolicy(readFileSync(file, "utf8"))) {
    errors.push("docs/index.html has lost its Content-Security-Policy meta tag.");
  }
}

// 4. Files that should never be in the public repository
for (const forbidden of [".staticrypt.json", "originals", "protected-output", ".env"]) {
  if (existsSync(join(root, forbidden))) errors.push(`${forbidden} must not be inside the repository.`);
}

// 5. Unencrypted originals built by the engine, anywhere in the repository (tracked or about to be).
let candidates;
try {
  candidates = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .map((p) => join(root, p));
} catch {
  candidates = walk(root, ["node_modules", ".git"]);
}
for (const file of candidates) {
  if (!/\.html?$/i.test(file) || !existsSync(file)) continue;
  const text = readFileSync(file, "utf8");
  if (text.includes('<script id="ethos-case"') && !text.includes("{{CASE_JSON}}")) {
    errors.push(`${relative(root, file)} looks like an unencrypted activity original. Move it out of the repository now.`);
  }
}

for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
if (errors.length) {
  console.error(`\nCheck failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`Check passed${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.`);
