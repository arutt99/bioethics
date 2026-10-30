// Build a private, unencrypted activity file from a case file and the ETHOS engine.
//
// Usage:
//   node tools/build-activity.mjs /path/to/private/cases/my-case.mjs /path/to/private/originals
//
// The case file (.mjs with a default export, or .json) holds the case content and stays
// private. The output folder must be OUTSIDE this repository: the built files are
// originals, and must be encrypted with tools/encrypt-activity.sh before publishing.
//
// A case with "parts" produces one file per part. Each part file contains its own
// worksheet sections and prompts, the case-file items released so far, and the labels
// of earlier answers it carries forward. The build fails if later content leaks into
// an earlier part.
import { readFileSync, writeFileSync, mkdirSync, realpathSync, existsSync } from "node:fs";
import { join, dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const engineDir = join(root, "engine");

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const [casePath, outDir] = process.argv.slice(2);
if (!casePath || !outDir) fail("Usage: node tools/build-activity.mjs <case.mjs|case.json> <private output folder>");
if (!existsSync(casePath)) fail(`Case file not found: ${casePath}`);

mkdirSync(outDir, { recursive: true });
const outAbs = realpathSync(resolve(outDir));
const rootAbs = realpathSync(root);
if (outAbs === rootAbs || outAbs.startsWith(rootAbs + sep)) {
  fail(`Refusing: the output folder is inside the public repository (${rootAbs}). Use your private authoring folder.`);
}

const source =
  extname(casePath) === ".json"
    ? JSON.parse(readFileSync(casePath, "utf8"))
    : (await import(pathToFileURL(resolve(casePath)).href)).default;

// ---------- Validate ----------

const errors = [];
const need = (cond, msg) => {
  if (!cond) errors.push(msg);
};
if (source.schemaVersion === 1) {
  fail("this case uses the old guided format (schemaVersion 1). Convert it first:\n  node tools/migrate-case.mjs <old-case.mjs> <new-case.mjs>");
}
need(source.schemaVersion === 2, "schemaVersion must be 2");
need(/^[a-z0-9][a-z0-9-]*$/.test(source.id || ""), "id must use lowercase letters, numbers and hyphens");
for (const k of ["version", "title", "items", "worksheet", "prompts"]) need(source[k], `missing "${k}"`);
need(source.start || ((source.parts || []).length && source.parts.every((p) => p.start)), 'missing "start" (on the case, or on every part)');

const KINDS = ["record", "person", "background", "policy"];
const items = source.items || {};
const sectionById = Object.fromEntries((source.worksheet || []).map((s) => [s.id, s]));
const prompts = source.prompts || {};
const optionSets = source.optionSets || {};
// Every report asks for a team name and members; supply plain defaults.
prompts["team.name"] ||= { type: "text", label: "Team name", shortLabel: "Team" };
prompts["team.members"] ||= { type: "text", label: "Team members", help: "First and last names, separated by commas." };

for (const [id, it] of Object.entries(items)) {
  need(/^[a-z0-9][a-z0-9-]*$/.test(id), `item ${id}: ids use lowercase letters, numbers and hyphens`);
  need(KINDS.includes(it.kind), `item ${id}: kind must be one of ${KINDS.join(", ")}`);
  need(it.title, `item ${id}: missing title`);
  for (const q of it.questions || []) need(q.question && Array.isArray(q.answer), `item ${id}: each question needs "question" and "answer" (a list of paragraphs)`);
}
for (const [id, p] of Object.entries(prompts)) {
  p.id = id;
  need(["textarea", "text", "choice"].includes(p.type), `prompt ${id}: unknown type "${p.type}"`);
  need(p.label, `prompt ${id}: missing label`);
  if (p.type === "choice") need(optionSets[p.options], `prompt ${id}: unknown option set "${p.options}"`);
  if (p.requiredIf) need(prompts[p.requiredIf.prompt], `prompt ${id}: requiredIf points to unknown prompt`);
}
const BLOCKS = ["text", "callout", "list", "quote", "record", "items", "concepts", "prompts", "carryForward", "trajectory", "perspectives"];
for (const s of source.worksheet || []) {
  need(/^[a-z0-9][a-z0-9-]*$/.test(s.id || ""), `worksheet section "${s.id}": ids use lowercase letters, numbers and hyphens`);
  need(s.title, `worksheet section ${s.id}: missing title`);
  for (const b of s.blocks || []) {
    need(BLOCKS.includes(b.type), `section ${s.id}: unknown block type "${b.type}"`);
    for (const id of b.ids || []) {
      if (b.type === "items") need(items[id], `section ${s.id}: unknown item "${id}"`);
      else if (["prompts", "carryForward"].includes(b.type)) need(prompts[id], `section ${s.id}: unknown prompt "${id}"`);
    }
    if (b.type === "trajectory") for (const st of b.steps) for (const id of st.ids) need(prompts[id], `section ${s.id}: unknown prompt "${id}"`);
    if (b.type === "perspectives") need(prompts[b.prompt] && prompts[b.prompt].type === "choice", `section ${s.id}: perspectives needs a choice prompt`);
  }
}
const partsList = source.parts || [];
for (const p of partsList) {
  for (const id of p.worksheet || []) need(sectionById[id], `part ${p.id}: unknown worksheet section "${id}"`);
  for (const id of p.items || []) need(items[id], `part ${p.id}: unknown item "${id}"`);
  need(/^[a-z0-9][a-z0-9-]*\.html$/.test(p.file || ""), `part ${p.id}: "file" must be a lowercase .html name`);
  need(p.report && p.report.sections, `part ${p.id}: missing report`);
}
if (partsList.length) {
  // Each item and each section belongs to exactly one part.
  for (const [what, all, key] of [["item", Object.keys(items), "items"], ["worksheet section", Object.keys(sectionById), "worksheet"]]) {
    for (const id of all) {
      const owners = partsList.filter((p) => (p[key] || []).includes(id)).length;
      need(owners === 1, `${what} "${id}" must be listed in exactly one part (found ${owners})`);
    }
  }
} else {
  need(source.report && source.report.sections, "missing report");
}
for (const r of [source.report, ...partsList.map((p) => p.report)]) {
  for (const sec of (r && r.sections) || []) for (const id of sec.ids) need(prompts[id], `report section "${sec.title}": unknown prompt "${id}"`);
}
if (errors.length) fail(`case file has problems:\n  ${errors.join("\n  ")}`);

// ---------- Number the case-file items ----------

// Items are numbered in the order they are released: Part 1's items first, grouped
// by kind, then each later part's. A number stays the same in every part.
const releases = partsList.length ? partsList.map((p) => p.items || []) : [Object.keys(items)];
const itemOrder = [];
const releasedIn = {};
releases.forEach((ids, partIndex) => {
  const sorted = [...ids].sort((a, b) => KINDS.indexOf(items[a].kind) - KINDS.indexOf(items[b].kind));
  for (const id of sorted) {
    releasedIn[id] = partIndex;
    itemOrder.push(id);
  }
});
const numberOf = Object.fromEntries(itemOrder.map((id, i) => [id, i + 1]));

// ---------- Assemble one file ----------

function stripNotes(value) {
  if (Array.isArray(value)) return value.map(stripNotes);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (k !== "notes") out[k] = stripNotes(v);
    return out;
  }
  return value;
}

function strings(value, acc = []) {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, acc));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, acc));
  return acc;
}

function assemble(part, partIndex) {
  const sectionIds = part ? part.worksheet : source.worksheet.map((s) => s.id);
  const sections = sectionIds.map((id) => sectionById[id]);
  // The case file grows: a part shows its own items and every earlier part's.
  const fileItems = itemOrder.filter((id) => !part || releasedIn[id] <= partIndex);
  const usedPrompts = new Set();
  let usesPerspectives = false;
  const report = part ? part.report : source.report;

  for (const s of sections) {
    for (const b of s.blocks) {
      if (b.type === "prompts" || b.type === "carryForward") b.ids.forEach((id) => usedPrompts.add(id));
      if (b.type === "trajectory") b.steps.forEach((st) => st.ids.forEach((id) => usedPrompts.add(id)));
      if (b.type === "perspectives") {
        usesPerspectives = true;
        usedPrompts.add(b.prompt);
      }
      if (b.type === "items") for (const id of b.ids) if (!fileItems.includes(id)) fail(`section ${s.id} points to item "${id}", which is not released until a later part`);
    }
  }
  for (const id of fileItems) if (prompts[`notes.${id}`]) usedPrompts.add(`notes.${id}`);
  for (const sec of report.sections) sec.ids.forEach((id) => usedPrompts.add(id));
  for (const id of ["team.name", "team.members"]) usedPrompts.add(id);
  for (const id of [...usedPrompts]) if (prompts[id].requiredIf) usedPrompts.add(prompts[id].requiredIf.prompt);

  const pick = (obj, ids) => Object.fromEntries([...ids].filter((id) => obj[id]).map((id) => [id, obj[id]]));
  const usedOptionSets = new Set([...usedPrompts].map((id) => prompts[id].options).filter(Boolean));

  const data = stripNotes({
    schemaVersion: source.schemaVersion,
    id: source.id,
    version: source.version,
    title: source.title,
    versionNote: source.versionNote || null,
    start: (part && part.start) || source.start,
    caseFile: (part && part.caseFile) || source.caseFile || null,
    part: part
      ? { id: part.id, label: part.label, order: partIndex, last: partIndex === partsList.length - 1, end: part.end || null }
      : null,
    outline: source.worksheet.map((s, i) => {
      const owner = partsList.findIndex((p) => p.worksheet.includes(s.id));
      return { id: s.id, number: i + 1, title: s.title, partLabel: owner >= 0 ? partsList[owner].label : null, partOrder: owner };
    }),
    worksheet: sections,
    items: Object.fromEntries(fileItems.map((id) => [id, { ...items[id], number: numberOf[id], isNew: !!part && partIndex > 0 && releasedIn[id] === partIndex }])),
    itemOrder: fileItems,
    prompts: pick(prompts, usedPrompts),
    optionSets: pick(optionSets, usedOptionSets),
    perspectives: usesPerspectives ? source.perspectives || {} : {},
    report,
  });

  // Leak check: no text from content this file should not contain.
  const included = new Set(strings(data));
  const excluded = [];
  for (const s of source.worksheet) if (!sectionIds.includes(s.id)) excluded.push(...strings(s));
  for (const [id, v] of Object.entries(items)) if (!fileItems.includes(id)) excluded.push(...strings(v));
  for (const [id, v] of Object.entries(prompts)) if (!usedPrompts.has(id)) excluded.push(...strings(v));
  if (!usesPerspectives) excluded.push(...strings(source.perspectives || {}));
  for (const p of partsList) if (p !== part) excluded.push(...strings([p.start, p.end, p.caseFile]));
  excluded.push(...collectNotes(source));
  const serialized = JSON.stringify(data);
  const leaks = [...new Set(excluded)].filter((t) => t.length >= 30 && !included.has(t) && serialized.includes(JSON.stringify(t).slice(1, -1)));
  if (leaks.length) fail(`${part ? part.label : "case"} would contain content from elsewhere in the case:\n  ${leaks.slice(0, 5).join("\n  ")}`);

  return data;
}

function collectNotes(value, acc = []) {
  if (Array.isArray(value)) value.forEach((v) => collectNotes(v, acc));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "notes") strings(v, acc);
      else collectNotes(v, acc);
    }
  }
  return acc;
}

function escapeHTML(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(data, pageTitle, eyebrow) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const swaps = {
    PAGE_TITLE: escapeHTML(pageTitle),
    CASE_TITLE: escapeHTML(data.title),
    EYEBROW: escapeHTML(eyebrow),
    CSS: readFileSync(join(engineDir, "ethos-engine.css"), "utf8"),
    CASE_JSON: json,
    ENGINE: readFileSync(join(engineDir, "ethos-engine.js"), "utf8"),
  };
  return readFileSync(join(engineDir, "template.html"), "utf8").replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in swaps ? swaps[k] : m));
}

const eyebrow = source.eyebrow || "ETHOS consultation";
if (source.parts && source.parts.length) {
  source.parts.forEach((part, i) => {
    const data = assemble(part, i);
    const file = join(outAbs, part.file);
    writeFileSync(file, render(data, `${source.title}: ${part.label}`, `${eyebrow} · ${part.label}`));
    console.log(`Built ${file}`);
  });
} else {
  const file = join(outAbs, `${source.id}.html`);
  writeFileSync(file, render(assemble(null, 0), source.title, eyebrow));
  console.log(`Built ${file}`);
}
console.log("These are unencrypted originals. Keep them private; publish only the output of tools/encrypt-activity.sh.");
