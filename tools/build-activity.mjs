// Build a private, unencrypted activity file from a case file and the ETHOS engine.
//
// Usage:
//   node tools/build-activity.mjs /path/to/private/cases/my-case.mjs /path/to/private/originals
//
// The case file (.mjs with a default export, or .json) holds the case content and stays
// private. The output folder must be OUTSIDE this repository: the built files are
// originals, and must be encrypted with tools/encrypt-activity.sh before publishing.
//
// A case with "parts" produces one file per part. Each part file contains only that
// part's stages, stakeholders, evidence and prompts, plus the labels of earlier answers
// it carries forward. The build fails if later content leaks into an earlier part.
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
need(source.schemaVersion === 1, "schemaVersion must be 1");
need(/^[a-z0-9][a-z0-9-]*$/.test(source.id || ""), "id must use lowercase letters, numbers and hyphens");
for (const k of ["version", "title", "stages", "prompts"]) need(source[k], `missing "${k}"`);
need(source.start || ((source.parts || []).length && source.parts.every((p) => p.start)), 'missing "start" (on the case, or on every part)');
const stageById = Object.fromEntries((source.stages || []).map((s) => [s.id, s]));
const stakeholders = source.stakeholders || {};
const evidence = source.evidence || {};
const prompts = source.prompts || {};
const optionSets = source.optionSets || {};
for (const [id, p] of Object.entries(prompts)) {
  p.id = id;
  need(["textarea", "text", "choice"].includes(p.type), `prompt ${id}: unknown type "${p.type}"`);
  need(p.label, `prompt ${id}: missing label`);
  if (p.type === "choice") need(optionSets[p.options], `prompt ${id}: unknown option set "${p.options}"`);
  if (p.requiredIf) need(prompts[p.requiredIf.prompt], `prompt ${id}: requiredIf points to unknown prompt`);
}
for (const s of source.stages || []) {
  for (const b of s.blocks || []) {
    for (const id of b.ids || []) {
      if (b.type === "stakeholders") need(stakeholders[id], `stage ${s.id}: unknown stakeholder "${id}"`);
      else if (b.type === "evidence") need(evidence[id], `stage ${s.id}: unknown evidence "${id}"`);
      else if (["prompts", "carryForward"].includes(b.type)) need(prompts[id], `stage ${s.id}: unknown prompt "${id}"`);
    }
  }
}
for (const p of source.parts || []) {
  for (const id of p.stages) need(stageById[id], `part ${p.id}: unknown stage "${id}"`);
  need(/^[a-z0-9][a-z0-9-]*\.html$/.test(p.file || ""), `part ${p.id}: "file" must be a lowercase .html name`);
  need(p.report && p.report.sections, `part ${p.id}: missing report`);
}
if (errors.length) fail(`case file has problems:\n  ${errors.join("\n  ")}`);

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
  const stageIds = part ? part.stages : source.stages.map((s) => s.id);
  const stages = stageIds.map((id) => stageById[id]);
  const usedPrompts = new Set();
  const usedStakeholders = new Set();
  const usedEvidence = new Set();
  let usesPerspectives = false;
  const report = part ? part.report : source.report;

  for (const s of stages) {
    for (const b of s.blocks) {
      if (b.type === "stakeholders") b.ids.forEach((id) => usedStakeholders.add(id));
      if (b.type === "evidence") b.ids.forEach((id) => usedEvidence.add(id));
      if (b.type === "prompts" || b.type === "carryForward") b.ids.forEach((id) => usedPrompts.add(id));
      if (b.type === "trajectory") b.steps.forEach((st) => st.ids.forEach((id) => usedPrompts.add(id)));
      if (b.type === "perspectives") {
        usesPerspectives = true;
        usedPrompts.add(b.prompt);
      }
      if (b.type === "report") (b.teamFields || []).forEach((id) => usedPrompts.add(id));
    }
  }
  for (const sid of usedStakeholders) if (prompts[`notes.${sid}`]) usedPrompts.add(`notes.${sid}`);
  for (const sec of report.sections) sec.ids.forEach((id) => prompts[id] && usedPrompts.add(id));
  for (const id of ["team.name", "team.members"]) if (prompts[id]) usedPrompts.add(id);
  for (const id of [...usedPrompts]) if (prompts[id] && prompts[id].requiredIf) usedPrompts.add(prompts[id].requiredIf.prompt);

  const pick = (obj, ids) => Object.fromEntries([...ids].filter((id) => obj[id]).map((id) => [id, obj[id]]));
  const usedOptionSets = new Set([...usedPrompts].map((id) => prompts[id].options).filter(Boolean));
  const partsList = source.parts || [];

  const data = stripNotes({
    schemaVersion: source.schemaVersion,
    id: source.id,
    version: source.version,
    title: source.title,
    versionNote: source.versionNote || null,
    start: (part && part.start) || source.start,
    part: part
      ? { id: part.id, label: part.label, order: partIndex, last: partIndex === partsList.length - 1, end: part.end || null }
      : null,
    outline: source.stages.map((s) => {
      const owner = partsList.findIndex((p) => p.stages.includes(s.id));
      return { id: s.id, number: s.number, title: s.title, partLabel: owner >= 0 ? partsList[owner].label : null, partOrder: owner };
    }),
    stages,
    stakeholders: pick(stakeholders, usedStakeholders),
    evidence: pick(evidence, usedEvidence),
    prompts: pick(prompts, usedPrompts),
    optionSets: pick(optionSets, usedOptionSets),
    perspectives: usesPerspectives ? source.perspectives || {} : {},
    report,
  });

  // Leak check: no text from content this file should not contain.
  const included = new Set(strings(data));
  const excluded = [];
  for (const s of source.stages) if (!stageIds.includes(s.id)) excluded.push(...strings(s));
  for (const [id, v] of Object.entries(stakeholders)) if (!usedStakeholders.has(id)) excluded.push(...strings(v));
  for (const [id, v] of Object.entries(evidence)) if (!usedEvidence.has(id)) excluded.push(...strings(v));
  for (const [id, v] of Object.entries(prompts)) if (!usedPrompts.has(id)) excluded.push(...strings(v));
  if (!usesPerspectives) excluded.push(...strings(source.perspectives || {}));
  for (const p of partsList) if (p !== part) excluded.push(...strings([p.start, p.end]));
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
  need(source.report && source.report.sections, "missing report");
  if (errors.length) fail(errors.join("\n"));
  const file = join(outAbs, `${source.id}.html`);
  writeFileSync(file, render(assemble(null, 0), source.title, eyebrow));
  console.log(`Built ${file}`);
}
console.log("These are unencrypted originals. Keep them private; publish only the output of tools/encrypt-activity.sh.");
