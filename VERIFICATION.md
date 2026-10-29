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
