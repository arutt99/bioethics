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

// ---------- Standard blocks ----------
// Two blocks every case can use with one line, written the same way in every case:
//   { type: "dissent" }      the committee vote, with a minority view when it isn't unanimous
//   { type: "consultNote" }  the note the committee leaves in the chart for the clinician who asked
const NOTE_FIELDS = [
  { key: "question", label: "Ethical question", help: "One sentence." },
  { key: "facts", label: "Relevant facts", help: "Only the facts the recommendation depends on." },
  { key: "recommendation", label: "Recommendation", help: "What the committee recommends, in plain words." },
  { key: "reasons", label: "Reasons", help: "The main reasons, and the strongest concern you weighed against them." },
  { key: "followup", label: "Next steps and follow-up", help: "Who does what next, and when the committee will check back." },
];
const standardBlocks = []; // [kind, section id, block]
for (const s of source.worksheet || []) {
  s.blocks = (s.blocks || []).map((b) => {
    if (b.type === "dissent") {
      optionSets["committee-vote"] ||= [
        { id: "unanimous", title: "Unanimous", description: "Every member of the committee supports the recommendation." },
        { id: "divided", title: "Not unanimous", description: "At least one member disagrees. Record the minority view." },
      ];
      prompts["committee.vote"] ||= { type: "choice", options: "committee-vote", label: "Did the committee agree on the recommendation?", shortLabel: "Committee vote", required: b.required !== false };
      prompts["committee.dissent"] ||= {
        type: "textarea",
        label: "Minority view",
        shortLabel: "Minority view",
        help: "State the dissenting position and its strongest reason, and what would have to change for the majority to agree. Name members only if they want to be named.",
        requiredIf: { prompt: "committee.vote", equals: "divided" },
        rows: 5,
      };
      const out = {
        type: "prompts",
        heading: b.heading || "Committee vote",
        intro: b.intro || "Real ethics committees record disagreement. A minority view is part of the record, not a failure to agree.",
        ids: ["committee.vote", "committee.dissent"],
      };
      standardBlocks.push(["dissent", s.id, out]);
      return out;
    }
    if (b.type === "consultNote") {
      const fields = b.fields || NOTE_FIELDS;
      for (const f of fields) {
        need(/^[a-z0-9-]+$/.test(f.key || "") && f.label, `section ${s.id}: each consultNote field needs a lowercase "key" and a "label"`);
        prompts[`note.${f.key}`] ||= { type: "textarea", label: f.label, help: f.help, shortLabel: f.label, rows: f.rows || 3, required: b.required !== false };
      }
      const out = { ...b, fields, ids: fields.map((f) => `note.${f.key}`), re: b.re || source.title };
      standardBlocks.push(["consultNote", s.id, out]);
      return out;
    }
    return b;
  });
}
for (const kind of ["dissent", "consultNote"]) {
  need(standardBlocks.filter(([k]) => k === kind).length <= 1, `a case can have only one "${kind}" block`);
}

for (const [id, it] of Object.entries(items)) {
  need(/^[a-z0-9][a-z0-9-]*$/.test(id), `item ${id}: ids use lowercase letters, numbers and hyphens`);
  need(KINDS.includes(it.kind), `item ${id}: kind must be one of ${KINDS.join(", ")}`);
  need(it.title, `item ${id}: missing title`);
  for (const q of it.questions || []) need(q.question && Array.isArray(q.answer), `item ${id}: each question needs "question" and "answer" (a list of paragraphs)`);
}
for (const [id, p] of Object.entries(prompts)) {
  p.id = id;
  need(["textarea", "text", "choice", "listChoice"].includes(p.type), `prompt ${id}: unknown type "${p.type}"`);
  need(p.label, `prompt ${id}: missing label`);
  if (p.type === "choice") need(optionSets[p.options], `prompt ${id}: unknown option set "${p.options}"`);
  if (p.requiredIf) need(prompts[p.requiredIf.prompt], `prompt ${id}: requiredIf points to unknown prompt`);
}
const BLOCKS = ["text", "callout", "list", "quote", "record", "items", "concepts", "prompts", "options", "optionFields", "consultNote", "carryForward", "trajectory", "perspectives"];
// Option lists students write themselves ("options" blocks), by block id.
const listBlocks = {};
const sectionOfList = {};
for (const s of source.worksheet || []) {
  for (const b of s.blocks || []) {
    if (b.type !== "options") continue;
    need(/^[a-z0-9][a-z0-9-]*$/.test(b.id || ""), `section ${s.id}: an options block needs an id of lowercase letters, numbers and hyphens`);
    need(!listBlocks[b.id] && !prompts[b.id], `options block "${b.id}": id is already used`);
    need(Array.isArray(b.fields) && b.fields.every((f) => /^[a-z0-9-]+$/.test(f.key || "") && f.key !== "name" && f.label), `options block "${b.id}": each field needs a lowercase "key" (not "name") and a "label"`);
    listBlocks[b.id] = b;
    sectionOfList[b.id] = s.id;
  }
}
for (const [id, p] of Object.entries(prompts)) {
  if (p.type === "listChoice") need(listBlocks[p.list], `prompt ${id}: "list" must name an options block`);
}
// Every field an option can have, from its own block and any optionFields blocks, so
// the engine can save, check and report them all.
for (const b of Object.values(listBlocks)) b.allFields = b.fields.map((f) => ({ ...f, required: b.required !== false }));
const fieldsBlocks = [];
for (const s of source.worksheet || []) {
  for (const b of s.blocks || []) {
    if (b.type !== "optionFields") continue;
    fieldsBlocks.push([s.id, b]);
    need(listBlocks[b.list], `section ${s.id}: optionFields "list" must name an options block`);
    need(Array.isArray(b.fields) && b.fields.every((f) => /^[a-z0-9-]+$/.test(f.key || "") && f.key !== "name" && f.label), `section ${s.id}: each optionFields field needs a lowercase "key" (not "name") and a "label"`);
    if (!listBlocks[b.list] || !Array.isArray(b.fields)) continue;
    for (const f of b.fields) {
      need(!listBlocks[b.list].allFields.some((g) => g.key === f.key), `section ${s.id}: field "${f.key}" is already used for options in "${b.list}"`);
      listBlocks[b.list].allFields.push({ ...f, required: b.required !== false });
    }
  }
}
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
    if (b.type === "perspectives" && b.after) {
      need(prompts[b.after], `section ${s.id}: perspectives "after" points to unknown prompt "${b.after}"`);
      need(optionSets[b.options], `section ${s.id}: perspectives "options" must name an option set`);
    } else if (b.type === "perspectives") {
      need(prompts[b.prompt] && prompts[b.prompt].type === "choice", `section ${s.id}: perspectives needs a choice prompt, or "after" and "options"`);
    }
    if (b.type === "carryForward") for (const id of b.ids) need(!prompts[id] || prompts[id].type !== "listChoice", `section ${s.id}: a list choice can't be carried forward; carry forward the written justification instead`);
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
// The committee vote and the consult note always reach the report: the report of their
// own part, and the final report. A case that places them itself is left alone.
for (const [kind, sid, b] of standardBlocks) {
  const owner = partsList.findIndex((p) => (p.worksheet || []).includes(sid));
  const reports = partsList.length ? [...new Set([owner, partsList.length - 1])].filter((i) => i >= owner).map((i) => [i, partsList[i] && partsList[i].report]) : [[0, source.report]];
  for (const [i, r] of reports) {
    if (!r || !r.sections || r.sections.some((sec) => (sec.ids || []).some((id) => b.ids.includes(id)))) continue;
    const earlier = partsList.length > 0 && i !== owner;
    if (kind === "dissent") r.sections.push({ title: "Committee vote", ids: b.ids, earlier });
    else r.sections.unshift({ title: "Ethics consultation note", ids: b.ids, earlier, note: { to: b.to || null, from: b.from || "Clinical Ethics Committee", re: b.re } });
  }
}
for (const r of [source.report, ...partsList.map((p) => p.report)]) {
  for (const sec of (r && r.sections) || []) {
    for (const id of sec.ids || []) need(prompts[id], `report section "${sec.title}": unknown prompt "${id}"`);
    for (const id of sec.lists || []) need(listBlocks[id], `report section "${sec.title}": unknown options block "${id}"`);
  }
}
// A list choice, and any extra option fields, must be in the same part as their list.
const partOfSection = (sid) => partsList.findIndex((p) => (p.worksheet || []).includes(sid));
for (const [sid, b] of fieldsBlocks) {
  if (listBlocks[b.list]) need(partOfSection(sid) === partOfSection(sectionOfList[b.list]), `section ${sid}: optionFields must be in the same part as options block "${b.list}"`);
}
for (const s of source.worksheet || []) {
  for (const b of s.blocks || []) {
    for (const id of b.type === "prompts" ? b.ids : []) {
      const p = prompts[id];
      if (p && p.type === "listChoice" && listBlocks[p.list]) need(partOfSection(s.id) === partOfSection(sectionOfList[p.list]), `prompt ${id}: must be in the same part as options block "${p.list}"`);
    }
  }
}
const fileStep = source.caseFile && source.caseFile.step;
need(fileStep === undefined || (Number.isInteger(fileStep) && fileStep >= 1 && fileStep <= (source.worksheet || []).length + 1), "caseFile.step must be a whole number from 1 to one more than the number of worksheet sections");
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
  const usedOptionSetNames = new Set();
  const report = part ? part.report : source.report;

  for (const s of sections) {
    for (const b of s.blocks) {
      if (b.type === "prompts" || b.type === "carryForward" || b.type === "consultNote") b.ids.forEach((id) => usedPrompts.add(id));
      if (b.type === "trajectory") b.steps.forEach((st) => st.ids.forEach((id) => usedPrompts.add(id)));
      if (b.type === "perspectives") {
        usesPerspectives = true;
        usedPrompts.add(b.after || b.prompt);
        if (b.options) usedOptionSetNames.add(b.options);
      }
      if (b.type === "items") for (const id of b.ids) if (!fileItems.includes(id)) fail(`section ${s.id} points to item "${id}", which is not released until a later part`);
    }
  }
  for (const id of fileItems) if (prompts[`notes.${id}`]) usedPrompts.add(`notes.${id}`);
  for (const sec of report.sections) (sec.ids || []).forEach((id) => usedPrompts.add(id));
  for (const id of Object.keys(Object.fromEntries(report.sections.flatMap((sec) => sec.lists || []).map((x) => [x, 1])))) {
    if (part && partOfSection(sectionOfList[id]) > partIndex) fail(`${part.label} report lists options block "${id}", which belongs to a later part`);
  }
  for (const id of ["team.name", "team.members"]) usedPrompts.add(id);
  for (const id of [...usedPrompts]) if (prompts[id].requiredIf) usedPrompts.add(prompts[id].requiredIf.prompt);

  const pick = (obj, ids) => Object.fromEntries([...ids].filter((id) => obj[id]).map((id) => [id, obj[id]]));
  const usedOptionSets = new Set([...[...usedPrompts].map((id) => prompts[id].options).filter(Boolean), ...usedOptionSetNames]);
  // Option lists named in the report, so a later part can print an earlier part's list.
  const reportLists = Object.fromEntries(report.sections.flatMap((sec) => sec.lists || []).map((id) => [id, listBlocks[id]]));

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
    // Step numbers skip the case file's step when it has one.
    outline: source.worksheet.map((s, i) => {
      const owner = partsList.findIndex((p) => p.worksheet.includes(s.id));
      // A section can repeat an earlier step's number with "step", for example a follow-up.
      const number = s.step || (fileStep && i + 1 >= fileStep ? i + 2 : i + 1);
      return { id: s.id, number, title: s.title, partLabel: owner >= 0 ? partsList[owner].label : null, partOrder: owner };
    }),
    worksheet: sections,
    items: Object.fromEntries(fileItems.map((id) => [id, { ...items[id], number: numberOf[id], isNew: !!part && partIndex > 0 && releasedIn[id] === partIndex }])),
    itemOrder: fileItems,
    prompts: pick(prompts, usedPrompts),
    optionSets: pick(optionSets, usedOptionSets),
    perspectives: usesPerspectives ? source.perspectives || {} : {},
    lists: reportLists,
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
    DOCX: readFileSync(join(engineDir, "ethos-docx.js"), "utf8"),
    ENGINE: readFileSync(join(engineDir, "ethos-engine.js"), "utf8"),
  };
  return readFileSync(join(engineDir, "template.html"), "utf8").replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in swaps ? swaps[k] : m));
}

const eyebrow = source.eyebrow || "ETHOS · Clinical Ethics Committee";
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
