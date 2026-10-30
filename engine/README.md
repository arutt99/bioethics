# ETHOS consultation engine

The engine turns a private **case file** into self-contained activity pages. The engine (this folder) is public and contains no case content. Case files and the pages built from them are private until encrypted.

```text
private case file (.mjs) ──build──▶ private original(s) ──encrypt──▶ docs/activities/
```

## Build a case

```bash
node tools/build-activity.mjs ~/ETHOS-private/cases/nurse-code.mjs ~/ETHOS-private/originals
```

Then open the built file in a browser to review it, and encrypt each part with `tools/encrypt-activity.sh`, using an unrelated passphrase for each part.

The build refuses to write inside this repository. It removes every key named `notes` (instructor notes) and fails if a part would contain text from a later part.

### Cases in the old guided format

Cases written before the case-file redesign (`schemaVersion: 1`) must be converted once:

```bash
node tools/migrate-case.mjs ~/ETHOS-private/cases/nurse-code.mjs ~/ETHOS-private/cases/nurse-code-v2.mjs
```

The converter turns stakeholders into people in the case file, evidence cards into records, and stages into worksheet sections. It prints a list of things to review by hand, including adding medical background items.

## The six-step method

Cases follow the method students use to solve cases:

1. Identify the moral problem
2. Gather relevant information (the case file)
3. Identify the available options and their likely consequences
4. Identify and evaluate arguments for and against the options
5. Choose a course of action and defend it
6. Carry out the chosen action and assess its consequences

Set `caseFile.step: 2` and the navigation column becomes a numbered list of steps, with the case file in second place. Write the other five steps as worksheet sections. A skeleton is at the end of this file.

## What students see

A page has two areas, and students move between them freely:

- **Case file.** Numbered tiles grouped into *Records and documents*, *People involved*, *Medical background*, and *Policies, codes and law*. Students open any tile in any order; nothing is required. Each tile shows whether it has been opened. People have expandable interview questions. Every item has an optional notes box, and any notes appear at the end of the report.
- **Worksheet.** The written sections. Students can answer them in any order. The navigation column shows each section as Not started, In progress, or Complete.
- **Their own options.** In step 3, students list the options they can see (two to start, with Add and Remove) and write the likely consequences of each. Step 4 shows each named option again for arguments for and against. In step 5 they choose from their own list. The options you wrote for the case appear only after they choose, as "Options others have considered."

The **Report** page lists any missing required answers (each one links to its field), then shows a preview with Download and Print or save as PDF. Students can download an incomplete report; it says how many answers were missing.

Other behavior:

- Students can open the case file from any step, through the navigation column or the Back to the case file button. When they came from a step, the case file and every item offer **Return to Step N**, which takes them back to the box they were last writing in. Answers are kept throughout.
- Item numbers follow release order and never change between parts, so you can say "Ana takes items 1 to 3" at a roundtable.
- In a later part, the case file keeps every earlier item and adds the new ones at the top under **New in Part 2**, with a New tag.
- Answers autosave to `localStorage` on this device, under one key per case. Parts of the same case share that key, so Part 2 picks up Part 1 answers in the same browser. If they are missing, Part 2 asks students to restate them, and the report says the answers were restated.
- Option comparisons (`perspectives`) stay hidden until the student chooses a recommendation.
- Medical background items carry a fixed line: "Plain-language background to help you follow the case. It is simplified, and it is not medical advice."
- **Clear my saved answers** in the footer, with a confirmation that explains what is cleared.

Not included: accounts, submission, analytics, scoring, paste blocking.

## Case file format

A case file is an ES module (`export default { ... }`) or JSON.

| Key | Contents |
| --- | --- |
| `schemaVersion` | `2` |
| `id`, `version`, `title` | Stable lowercase id; version string shown in reports |
| `versionNote` | Optional banner on the opening screen (for drafts) |
| `start` | Opening screen: `heading`, `lead`, `startLabel` (default "Open the case file"), `sections[]`. Can be set per part instead |
| `caseFile` | Optional `{ heading, intro[], step, navLabel }`. `heading` and `intro` appear above the tiles (for example, roundtable instructions). `step` makes the case file a numbered step; `navLabel` is its name in the navigation column. Can be set per part |
| `items` | The case file: `{ id: item }`. See below |
| `worksheet` | Written sections: `[{ id, title, introduction[], blocks[], step }]`. Sections are numbered in order; `step` repeats an earlier number, for a follow-up such as "6 Assess the consequences" in a later part. Use it only on the last sections |
| `prompts` | `{ id: { type: textarea\|text\|choice\|listChoice, label, shortLabel, help, required, requiredIf: { prompt, equals }, options, restateLabel, rows } }`. `team.name` and `team.members` are added if missing |
| `optionSets` | `{ name: [{ id, title, description }] }` |
| `perspectives` | `{ optionId: { addresses[], leavesOpen[] } }`, shown in a `perspectives` block |
| `report` | For a single-file case: `{ title, heading, intro[], filename, downloadLabel, sections[{ title, ids[], lists[], earlier? }] }`. `lists` names `options` blocks; each named option appears with everything written for it |
| `parts[]` | Optional. `{ id, label, file, items[], worksheet[], start, caseFile, end, report }`. Each item and each worksheet section belongs to exactly one part. `end` (`heading`, `paragraphs`, `reportHeading`, `reportIntro`, `downloadLabel`) heads the record page of a non-final part |

### Items

Every item has `kind`, `title`, and optionally `summary` (one line on the tile), `source`, `introduction[]`, `sections[]`, `limits[]` (shown as "What this can't tell you"), `noteLabel`, and `noteField: false` to remove its notes box.

Each entry in `sections` can have `heading`, `paragraphs[]`, `items[]` (a bulleted list), `rows` (`[label, value]` pairs, shown as a table), `quote[]`, and `quoteSource`.

| `kind` | Use for | Extra fields |
| --- | --- | --- |
| `record` | The referral, charts, notes, letters, advance directives | |
| `person` | Anyone students can hear from | `role`, `questions[{ question, answer[] }]`, `questionsHeading` |
| `background` | Plain-language explanation of a condition or treatment | |
| `policy` | Professional codes, hospital policy, law | |

### Writing medical background items

Write for a student with no clinical training. Use short sentences and everyday words, and explain any term you have to use the first time it appears. Suggested sections:

1. **What it is**: one or two sentences.
2. **What it's like day to day**: for the person and for the people caring for them.
3. **What treatment can and can't do**: including the treatment at issue in the case.
4. **What usually happens over time**: the typical course and how certain anyone can be.
5. **Common misunderstandings**: the beliefs students are likely to bring with them.

Give only the medical facts students need to follow the case. Don't use a background item to settle an ethical question, for example by saying what a good decision would be. Have a clinician check every background item before release, and record who checked it and when in a `notes` key (it's removed from the built page).

```js
dementia: {
  kind: "background",
  title: "Advanced dementia",
  summary: "What the late stage looks like, and what tube feeding can and can't do.",
  sections: [
    { heading: "What it is", paragraphs: ["..."] },
    { heading: "Common misunderstandings", items: ["...", "..."] },
  ],
  notes: "Checked by [name], [date].",
},
```

### Worksheet blocks

`text`, `callout`, `list`, `quote`, `record` (label/value rows), `items` (tiles linking to case-file items, for example "New in the case file"), `concepts` (expandable explanations), `prompts`, `carryForward` (earlier-part answers, with a restate field if missing), `trajectory` (earlier answers side by side), and:

| Block | Contents |
| --- | --- |
| `options` | Students list their own options. `{ id, heading, intro[], fields[{ key, label, help }], min (default 2), max (default 6), required, addLabel, reportLabel, nameLabel, nameHelp }`. An option is a course of action someone in the case could take, such as "tell the truth" or "shade the truth". Each one has a name plus these fields. The name's help text defaults to "A course of action someone in the case could take, in a few words." Set `nameHelp` to give a case-specific example |
| `optionFields` | More fields for each named option from an `options` block, in a later step. `{ list, heading, intro[], fields[{ key, label }], required }` |
| `perspectives` | Either `{ heading, intro[], prompt }` for a `choice` prompt (shows the chosen option and the rest), or `{ heading, intro[], after, options }` to show an option set only once the prompt named by `after` is answered |

A `listChoice` prompt (`{ type: "listChoice", list: "<options block id>" }`) offers the student's own named options as radio buttons. An `options` block, its `optionFields`, and any `listChoice` from it must be in the same part, and a `listChoice` can't be carried forward. Carry forward the written defense instead. So split a case into parts before step 3 or after step 5, not in between.

Use stable prompt ids. Answers are saved by id, so renaming a label is safe but reusing an id for a different question attaches old answers to it.

### New information

A later part adds items to the case file. It doesn't have to change anyone's mind: most of the time it's simply more to weigh, such as a new person to hear from, a document, or a changed constraint. Write the prompt so that keeping a view is as acceptable as changing it, for example: "Does the new information change your recommendation, or how you would carry it out? It's fine if it doesn't. Explain why."

## Skeleton for the six-step method

```js
export default {
  schemaVersion: 2,
  id: "my-case",
  version: "0.1-draft",
  title: "My Case",
  caseFile: { step: 2, navLabel: "Gather relevant information", heading: "Gather relevant information" },
  items: { /* records, people, medical background, policies */ },
  worksheet: [
    { id: "problem", title: "Identify the moral problem", blocks: [{ type: "prompts", ids: ["problem", "initial-view"] }] },
    {
      id: "options",
      title: "Identify the options and their likely consequences",
      blocks: [{ type: "options", id: "opts", intro: ["List every course of action you can see, including ones you'd reject."], nameHelp: "For example: tell the truth, or shade the truth.", fields: [{ key: "consequences", label: "Likely consequences" }] }],
    },
    {
      id: "arguments",
      title: "Evaluate arguments for and against",
      blocks: [{ type: "optionFields", list: "opts", fields: [{ key: "for", label: "Arguments for" }, { key: "against", label: "Arguments against" }] }],
    },
    {
      id: "choose",
      title: "Choose a course of action and defend it",
      blocks: [
        { type: "prompts", ids: ["choice", "defense", "objection"] },
        { type: "perspectives", heading: "Options others have considered", after: "choice", options: "case-options" },
      ],
    },
    { id: "act", title: "Carry out the chosen action", blocks: [{ type: "prompts", ids: ["plan", "watch-for"] }] },
  ],
  prompts: {
    choice: { type: "listChoice", list: "opts", label: "Which of your options do you choose?", shortLabel: "Chosen option", required: true },
    plan: { type: "textarea", label: "Who does what first, and what could go wrong?", shortLabel: "Action plan", required: true },
    "watch-for": { type: "textarea", label: "How will you know whether it worked, and what would make you revisit the decision?", shortLabel: "What to watch for", required: true },
    /* problem, initial-view, defense, objection ... */
  },
  report: { title: "Consultation report", filename: "my-case-report.html", sections: [{ title: "Options", lists: ["opts"] } /* ... */] },
};
```

For a follow-up, add a later part whose case file holds a record of what happened ("Six weeks later") and a worksheet section with `step: 6` titled "Assess the consequences". It carries the action plan forward and asks how things went, judged against the plan.
