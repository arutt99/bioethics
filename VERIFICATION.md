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
