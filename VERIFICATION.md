# Verification record: first build

Date: 2026-10-29. StatiCrypt 3.5.4. Chromium (Playwright), served locally under a `/bioethics/` subpath to mimic a GitHub Pages project site.

## Checked locally

| Acceptance criterion | Result |
| --- | --- |
| Homepage runs from a local server and works under a project subpath | Pass |
| `available`, `coming-soon`, and `hidden` entries display according to the settings | Pass |
| Activity's direct address shows the code prompt | Pass |
| Incorrect code shows a readable message and keeps the entered code | Pass |
| Correct code opens the activity | Pass |
| Show/hide code control works and reports its state (`aria-pressed`) | Pass |
| Activity text not readable in the published encrypted HTML (marker text and passphrase searched for) | Pass |
| Navigation, required-field validation, and report download work after decryption, including apostrophes and non-ASCII text | Pass |
| No horizontal scrolling at 360 px wide (homepage and code prompt) | Pass |
| "Open activity" link reachable and activated by keyboard; code entered and submitted by keyboard | Pass |
| Reload asks for the code again (no "remember me") | Pass |
| Missing or malformed `activities.json` shows a readable message | Pass |
| Unsafe `path` values rejected; settings text rendered as text, not HTML | Pass |
| `npm run check` fails when an unencrypted page is placed in `docs/activities/` | Pass |
| Public file list contains no original activity or code, and history doesn't either | Pass (the demo original and its code were never inside the repository) |
| Placeholder content is visibly labeled | Pass |

## Still requires the live GitHub Pages deployment

- Pages configured to publish `main` → `/docs`, and the site loads at `https://arutt99.github.io/bioethics/`
- All links work on the live address
- Code prompt, wrong code, right code, and report download on the live site
- Check on a real phone and with a screen reader

The site has **not** been published yet.

# Verification record: first consultation case (draft 0.1)

Date: 2026-10-29. Case *The Nurse Who Thought the Code Was Wrong*, version 0.1-draft, built with `tools/build-activity.mjs` and encrypted with StatiCrypt 3.5.4. Chromium (Playwright).

## Checked locally

| Check | Result |
| --- | --- |
| Opening screen shows Start Consultation first | Pass |
| Full six-stage route across Part 1 and Part 2 | Pass |
| Missing required answers: error summary lists each, focus moves to it, entered text is kept | Pass |
| Each interview must be opened before Stage 2 can be finished | Pass |
| Conditional field (“Another recommendation”) appears and becomes required only when chosen | Pass |
| Back navigation through the progress column keeps answers | Pass |
| Part 1 answers carry into Part 2 in the same browser (also checked through the encrypted pages) | Pass |
| Part 2 in a fresh browser asks students to restate the provisional recommendation; report notes the restatement | Pass |
| Part 1 file contains no Part 2 content (build leak check, plus text search) | Pass |
| Instructor notes removed from built files | Pass |
| Report download (.html), with apostrophes, quotation marks, angle brackets, line breaks, and non-ASCII text | Pass |
| Initial, provisional, post-evidence, and final recommendations shown separately in the report | Pass |
| No horizontal scrolling at 360 px wide | Pass |
| Encrypted pages: wrong code fails, right code opens, Back to all activities returns to the course page under `/bioethics/` | Pass |
| Print view shows only the report | Pass |
| `npm run check` | Pass |

## Not yet checked

- Printing on paper
- Screen reader pass, real phones, Safari and Firefox
- Live GitHub Pages deployment
- Classroom timing

# Verification record: security hardening

Date: 2026-10-29. StatiCrypt 3.5.4. Chromium (Playwright), served locally under `/bioethics/`. A throwaway test case and code were used; they were kept outside the repository and never committed.

| Check | Result |
| --- | --- |
| Homepage loads and lists activities under its Content Security Policy, with no policy errors | Pass |
| Code prompt, wrong-code message, and Back link work on all three published activities with the policy added | Pass |
| Engine-built test activity, encrypted with the new template: right code opens it, the six-stage flow runs, the report downloads, and inserted text is escaped | Pass |
| After decryption, the policy is still in force: a network request from the activity page is blocked | Pass |
| Adding the policy to the published activities changed only the unencrypted wrapper; the encrypted content is byte-for-byte unchanged | Pass |
| `tools/encrypt-activity.sh` refuses mismatched entries and codes under 16 characters; the code doesn't appear in the output file | Pass |
| `npm run check` fails on: an engine-built original anywhere in the repository, an extra page in `docs/`, the homepage without its policy, an activity without its policy, and an activity with "remember me" turned on | Pass |
| Pre-commit hook blocks a commit containing an unencrypted original | Pass |

## Not yet checked

- Right-code decryption of the three published activities under the policy (their codes aren't in this environment). Test each one once after deploying.
- Whether the policy stays in force after decryption in Firefox and Safari. If it doesn't, nothing breaks, but those browsers lose that extra layer.

# Verification record: case-file engine

Date: 2026-10-30. Engine rebuilt around a case file and an open worksheet (`schemaVersion: 2`). Tested with a throwaway two-part fictional case kept outside the repository, in Chromium (Playwright). The published nurse-code pages were not rebuilt; they still use the earlier engine until the private case is converted.

| Check | Result |
| --- | --- |
| Opening screen shows Open the case file first | Pass |
| Case file groups tiles by kind (records, people, medical background, policies), in any order, nothing required | Pass |
| Medical background item shows the plain-language disclaimer | Pass |
| Item numbers stay the same across parts; Part 2 shows new items first, marked New, with Part 1 items below | Pass |
| Opened status carries between parts in the same browser | Pass |
| Worksheet sections open in any order; status shows Not started, In progress, or Complete | Pass |
| Report page lists missing required answers; each link moves focus to its field and shows an inline message that clears on typing | Pass |
| Incomplete report can be downloaded and says how many answers were missing | Pass |
| Case-file notes appear in the report, escaped | Pass |
| Option comparison stays hidden until a recommendation is chosen | Pass |
| Conditional field appears when its option is chosen and is listed as missing if empty | Pass |
| Part 2 in a fresh browser asks students to restate earlier answers; report notes the restatement | Pass |
| Part 1 file contains no Part 2 content; instructor notes removed | Pass |
| Keyboard: tiles open with Enter, focus moves to the page heading | Pass |
| No horizontal scrolling at 360 px wide | Pass |
| No console or policy errors | Pass |
| `tools/migrate-case.mjs` converts an old-format test case, and the result builds; the build refuses old-format cases with a pointer to the converter | Pass |
| `npm run check` | Pass |

## Not yet checked

- The converted nurse-code case (the private case file isn't in this environment)
- Encrypted copies of case-file pages on the live site
- Screen reader pass, real phones, Safari and Firefox
- Classroom timing for the roundtable format

# Verification record: six-step method

Date: 2026-10-30. Tested with a throwaway three-part fictional case built around the six steps (Part 1: steps 1 to 5; Part 2: new information and step 6 action plan; Part 3: follow-up and step 6 assessment), kept outside the repository. Chromium (Playwright). The earlier case-file checks were re-run and still pass.

| Check | Result |
| --- | --- |
| Navigation lists the six steps in order, with the case file as step 2 and the follow-up as a second step 6 | Pass |
| Step 3 starts with two empty options; Add focuses the new option; Remove asks first when there's text, and isn't offered below the minimum | Pass |
| Step 4 shows each named option, by name, with its argument fields; before any option is named it points back to step 3 and shows Not started | Pass |
| Step 5 offers the student's own options; renaming an option after choosing keeps the choice | Pass |
| The case's own options stay hidden until a choice is made, then open on the same page | Pass |
| Report lists each option with its consequences and arguments, and the chosen option by its current name; text escaped | Pass |
| A Part 3 report includes the Part 1 option list in the same browser, and says "No options listed" in a fresh one | Pass |
| No horizontal scrolling at 360 px; no console or policy errors | Pass |
| `npm run check` | Pass |
