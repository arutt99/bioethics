# ETHOS consultation engine

The engine turns a private **case file** into self-contained activity pages that follow the six-stage structure in the design manual. The engine (this folder) is public and contains no case content. Case files and the pages built from them are private until encrypted.

```text
private case file (.mjs) ──build──▶ private original(s) ──encrypt──▶ docs/activities/
```

## Build a case

```bash
node tools/build-activity.mjs ~/ETHOS-private/cases/nurse-code.mjs ~/ETHOS-private/originals
```

Then open the built file in a browser to review it, and encrypt each part with `tools/encrypt-activity.sh`, using an unrelated passphrase for each part.

The build refuses to write inside this repository. It removes every key named `notes` (instructor notes) and fails if a part would contain text from a later part.

## What the engine does

- Opening screen with **Start Consultation** first, then the case purpose, a content note, and the save behavior.
- Six-stage progress column (stacks above the content on small screens). Completed stages stay reviewable, and editing an earlier answer never clears later ones.
- Stakeholder interviews as expandable questions. A stage can require each interview to be opened.
- Evidence cards with a stated source and limits.
- Required-field checks with an error summary, inline messages, and focus moved to the summary. Entered text is kept.
- Answers autosave to `localStorage` on this device, under one key per case. Parts of the same case share that key, so Part 2 picks up Part 1 answers in the same browser. If they are missing, Part 2 asks students to restate them from their Part 1 record, and the report says the answers were restated.
- Reasoning trajectory (initial, provisional, after evidence, final) and option perspectives shown only after the final recommendation.
- Report preview, a download as a standalone `.html` file, and Print or save as PDF. Inserted text is escaped.
- **Clear my saved answers** in the footer, with a confirmation that explains what is cleared.

Not included: accounts, submission, analytics, scoring.

## Case file format

A case file is an ES module (`export default { ... }`) or JSON. Example and full working case: kept privately. Summary:

| Key | Contents |
| --- | --- |
| `schemaVersion` | `1` |
| `id`, `version`, `title` | Stable lowercase id; version string shown in reports |
| `versionNote` | Optional banner on the opening screen (for drafts) |
| `start` | Opening screen: `heading`, `lead`, `startLabel`, `sections[]`. Can be set per part instead |
| `parts[]` | Optional. `id`, `label`, `file`, `stages[]` (stage ids), `start`, `end` (screen after a non-final part), `report` |
| `report` | For a single-file case: `title`, `filename`, `sections[]` of `{ title, ids[], earlier? }` |
| `stages[]` | `id`, `number`, `title`, `introduction[]`, `blocks[]`, `transition`, `nextLabel` |
| `stakeholders` | `{ id: { name, role, introduction[], questions[{ question, answer[] }] } }`. A prompt named `notes.<id>` becomes that interview's note field |
| `evidence` | `{ id: { title, source, content[], points[], after[], limits[] } }` |
| `prompts` | `{ id: { type: textarea\|text\|choice, label, shortLabel, help, required, requiredIf: { prompt, equals }, options, restateLabel, rows } }` |
| `optionSets` | `{ name: [{ id, title, description }] }` |
| `perspectives` | `{ optionId: { addresses[], leavesOpen[] } }`, shown in a `perspectives` block |

Block types: `text`, `callout`, `list`, `quote`, `record` (label/value rows), `stakeholders`, `evidence`, `concepts` (expandable explanations), `prompts`, `carryForward` (earlier-part answers), `trajectory`, `perspectives`, `report`.

Use stable prompt ids. Answers are saved by id, so renaming a label is safe but reusing an id for a different question attaches old answers to it.
