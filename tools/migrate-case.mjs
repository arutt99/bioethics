// Convert a case written for the old guided engine (schemaVersion 1) to the
// case-file format (schemaVersion 2).
//
// Usage:
//   node tools/migrate-case.mjs /path/to/private/cases/old-case.mjs /path/to/private/cases/new-case.mjs
//
// What it does:
//   - each stakeholder becomes a "person" item in the case file
//   - each evidence card becomes a "record" item
//   - each stage becomes a worksheet section; its stakeholders and evidence blocks
//     become "items" blocks that point to the new case-file items
//   - each part lists the items its stages used to show, and its stages as "worksheet"
//
// Read the output before building: the converter can't write medical background
// items, and stage text that talks about a "reveal" or about unlocking the next
// stage needs rewording by hand. Both files stay private: the output must be
// outside this repository.
import { readFileSync, writeFileSync, realpathSync, existsSync } from "node:fs";
import { join, dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), ".."));

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) fail("Usage: node tools/migrate-case.mjs <old-case.mjs|.json> <new-case.mjs>");
if (!existsSync(inPath)) fail(`Case file not found: ${inPath}`);
const outAbs = resolve(outPath);
const outDir = realpathSync(dirname(outAbs));
if (outDir === root || outDir.startsWith(root + sep)) fail(`Refusing: the output is inside the public repository (${root}). Use your private authoring folder.`);
if (existsSync(outAbs)) fail(`${outAbs} already exists. Choose a new file name.`);

const old =
  extname(inPath) === ".json" ? JSON.parse(readFileSync(inPath, "utf8")) : (await import(pathToFileURL(resolve(inPath)).href)).default;
if (old.schemaVersion !== 1) fail(`expected schemaVersion 1, found ${old.schemaVersion}`);

const review = [];
const items = {};
const prompts = { ...old.prompts };

for (const [id, s] of Object.entries(old.stakeholders || {})) {
  const item = { kind: "person", title: s.name, role: s.role, introduction: s.introduction, questions: s.questions };
  // The engine now adds a notes field to every item under the same id.
  if (prompts[`notes.${id}`]) {
    item.noteLabel = prompts[`notes.${id}`].label;
    delete prompts[`notes.${id}`];
  }
  if (s.notes) item.notes = s.notes;
  items[id] = item;
}
for (const [id, e] of Object.entries(old.evidence || {})) {
  if (items[id]) fail(`a stakeholder and an evidence card share the id "${id}"; rename one first`);
  const sections = [];
  if (e.content || e.points) sections.push({ paragraphs: e.content, items: e.points });
  if (e.after) sections.push({ paragraphs: e.after });
  items[id] = { kind: "record", title: e.title, source: e.source, sections, limits: e.limits };
  if (e.notes) items[id].notes = e.notes;
}

const itemsInStage = {};
const worksheet = (old.stages || []).map((stage) => {
  itemsInStage[stage.id] = [];
  const blocks = [];
  for (const b of stage.blocks || []) {
    if (b.type === "stakeholders" || b.type === "evidence") {
      itemsInStage[stage.id].push(...b.ids);
      blocks.push({ type: "items", heading: b.heading, intro: b.intro, ids: b.ids });
    } else if (b.type === "report") {
      review.push(`Stage "${stage.id}": its report block was removed. The report is now its own page.`);
    } else {
      blocks.push(b);
    }
  }
  if (stage.transition || stage.nextLabel) review.push(`Stage "${stage.id}": "transition" and "nextLabel" were dropped. Sections are no longer locked in order.`);
  const out = { id: stage.id, title: stage.title, introduction: stage.introduction, blocks };
  if (stage.notes) out.notes = stage.notes;
  return out;
});

const out = {
  schemaVersion: 2,
  id: old.id,
  version: old.version,
  title: old.title,
};
for (const k of ["eyebrow", "versionNote", "start"]) if (old[k]) out[k] = old[k];
out.items = items;
out.worksheet = worksheet;
out.prompts = prompts;
for (const k of ["optionSets", "perspectives", "report"]) if (old[k]) out[k] = old[k];

if (old.parts && old.parts.length) {
  const placed = new Set();
  out.parts = old.parts.map((p) => {
    const own = [];
    for (const sid of p.stages) {
      for (const id of itemsInStage[sid] || []) {
        if (placed.has(id)) continue;
        placed.add(id);
        own.push(id);
      }
    }
    const { stages, ...rest } = p;
    return { ...rest, items: own, worksheet: stages };
  });
  const unplaced = Object.keys(items).filter((id) => !placed.has(id));
  if (unplaced.length) {
    out.parts[0].items.push(...unplaced);
    review.push(`These items weren't shown in any stage and were put in the first part: ${unplaced.join(", ")}.`);
  }
}
if ([old.start, ...(old.parts || []).map((p) => p.start)].some((st) => st && st.startLabel)) review.push('Check "startLabel" on the opening screen: the first action now opens the case file.');
review.push("Add medical background items (kind: \"background\") for the conditions in the case, and have a clinician check them.");
review.push('Reword any stage text that talks about a "reveal" or tells students they must finish one stage before the next.');

const header = [
  "// Converted from the guided format by tools/migrate-case.mjs. Review before building:",
  ...review.map((r) => `//   - ${r}`),
  "",
].join("\n");
writeFileSync(outAbs, `${header}export default ${JSON.stringify(out, null, 2)};\n`);
console.log(`Wrote ${outAbs}`);
console.log("Review before building:");
for (const r of review) console.log(`  - ${r}`);
