# ETHOS course website

Static GitHub Pages site (published from `main` → `/docs`) that lists ETHOS bioethics activities. Each activity is a StatiCrypt-encrypted HTML page. Requirements: `planning/ETHOS_GitHub_Pages_Build_Brief.md`. Instructor workflow: `README.md`.

## Hard rules

- Never commit original (unencrypted) activity HTML, access codes, passphrases, or decrypted output. History is public and permanent.
- Everything in `docs/activities/*.html` must be StatiCrypt output. `npm run check` enforces this.
- No codes or reversible hints in `docs/data/activities.json` or any public file.
- Keep the homepage buildless: plain HTML, CSS, and JavaScript. No framework.
- Use relative links only; the site is served under `/bioethics/`.
- Insert settings text with `textContent`, never `innerHTML`.
- Keep the Content-Security-Policy `<meta>` tags in `docs/index.html`, `tools/password_template.html`, and `engine/template.html`. Don't loosen them (no external hosts, no `connect-src`) without the instructor's say-so.
- Encrypted pages must keep `isRememberEnabled: false`. Codes must be at least 16 characters (enforced by `tools/encrypt-activity.sh`).
- Out of scope for v1: accounts, dashboards, analytics, grading, central submissions, paid services.

## Commands

- `npm ci`: install pinned StatiCrypt 3.5.4
- `npm run check`: validate settings and confirm activities are encrypted
- `npm run serve`: preview at http://localhost:8000/
- `tools/encrypt-activity.sh <private-original.html> "Title"`: encrypt (prompts for the code)
