# ETHOS Bioethics Activities

A static course website for interactive ETHOS bioethics activities, hosted free on GitHub Pages.

- Students browse the activity list without an account.
- Each activity is an encrypted HTML page. Students need that activity's access code to open it.
- You (the instructor) control what's listed by editing one file: `docs/data/activities.json`.

The full requirements are in [`planning/ETHOS_GitHub_Pages_Build_Brief.md`](planning/ETHOS_GitHub_Pages_Build_Brief.md). The case-design guide is [`planning/ETHOS_Bioethics_Simulator_Design_and_Iteration_Manual.docx`](planning/ETHOS_Bioethics_Simulator_Design_and_Iteration_Manual.docx).

## Repository layout

```text
docs/                      ← published by GitHub Pages
  index.html               homepage
  .nojekyll                serve files as-is
  assets/
    styles.css
    validate.js            settings rules (used by the homepage and the local check)
    app.js                 builds the activity list
  data/
    activities.json        the activity list you edit
  activities/
    demo-activity.html     ENCRYPTED files only
    nurse-code-part-1.html
    nurse-code-part-2.html
engine/                    reusable case-file consultation engine (no case content)
planning/                  design manual and build brief (not published to the site)
.githooks/pre-commit       runs npm run check before each commit
tools/
  build-activity.mjs       builds private activity pages from a private case file
  migrate-case.mjs         converts an old guided-format case to the case-file format
  encrypt-activity.sh      encrypts one original into docs/activities/
  password_template.html   the styled code-entry screen
  check.mjs                pre-publish check (npm run check)
package.json               pins StatiCrypt 3.5.4
```

## The one rule

**Original activity files and access codes never go in this repository**, not even briefly. Anything committed stays in the public history even after you delete it. Keep them in a private folder elsewhere on your computer, for example:

```text
~/ETHOS-private/          ← never inside this repository
  originals/
    consultation-01.html
  codes.txt               ← or a password manager
```

`.gitignore` blocks some common names as a backup, but it can't protect a file that's already committed.

## One-time setup

### On GitHub

1. Merge the setup branch into `main`.
2. Go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then **main** and **/docs**, and save.
3. Wait for the deployment to finish (up to about 10 minutes). Check progress under the **Actions** tab. Your course link will be `https://arutt99.github.io/bioethics/`.
4. On the same Pages screen, tick **Enforce HTTPS** once it becomes available.
5. Only you should have write access. Check **Settings → Collaborators**.
6. Turn on two-factor authentication for your GitHub account (**your profile picture → Settings → Password and authentication**). Anyone who gets into your account could change what students see on this site, so this is the most important protection.
7. Under **Settings → Code security**, turn on **Secret scanning** and **Push protection**, and **Dependabot alerts**.

### On your computer

You need [Node.js](https://nodejs.org/) (version 18 or newer) and Git. Clone the repository, then install the pinned encryption tool:

```bash
npm ci
```

This also turns on a pre-commit check (`.githooks/pre-commit`) that runs `npm run check` before each commit, so an unencrypted original is stopped before it reaches the public history. Don't bypass it with `--no-verify`.

## Add an activity

1. Finish and test the original HTML in your private folder. Name it with lowercase letters, numbers, and hyphens, such as `consultation-01.html`. That name becomes its web address.
2. Choose a passphrase of at least 16 characters as its code, such as four or more unrelated words. Don't reuse a code, and don't base it on the activity's name or the course. Anyone can download the encrypted page and try guesses on their own computer as fast as it allows, so length is what keeps the activity closed. Write it down privately.
3. Encrypt it. The tool asks for the code twice and refuses codes shorter than 16 characters. The code never appears in a script or your shell history:

   ```bash
   tools/encrypt-activity.sh ~/ETHOS-private/originals/consultation-01.html "Bioethics Consultation"
   ```

   The encrypted copy is saved to `docs/activities/consultation-01.html`. The script refuses to run if the original is inside this repository.
4. Add an entry to `docs/data/activities.json` (see below).
5. Run the check, then preview the site locally:

   ```bash
   npm run check
   ```

   ```bash
   npm run serve
   ```

   Open <http://localhost:8000/>, open the activity, and test both a wrong code and the right one.
6. Commit and push to `main`. Wait for the Pages deployment to finish.
7. Open the live activity, confirm the code prompt appears, and test the code.
8. Give students the code when you're ready.

**Supporting files.** Encryption covers only the HTML file. Images, scripts, or PDFs the activity links to stay publicly readable. Prefer self-contained activities. If you must publish a supporting file, make sure it contains nothing you want protected. `npm run check` lists any you publish.

## Build a consultation case with the engine

New consultation cases can be written as a private case file and built with the engine in `engine/`. See [`engine/README.md`](engine/README.md) for the format.

```bash
node tools/build-activity.mjs ~/ETHOS-private/cases/nurse-code.mjs ~/ETHOS-private/originals
```

This writes one original per part into your private folder. Open them in a browser to review, then encrypt each with `tools/encrypt-activity.sh` as above.

Cases written for the earlier guided version of the engine need converting once with `tools/migrate-case.mjs` (see [`engine/README.md`](engine/README.md)). The published nurse-code pages keep working as they are until you rebuild them.

### Cases released in parts

A case split into parts (for example, so new information reaches the whole class at the same moment) produces one file per part. Each part's case file keeps the earlier items and adds its own, marked New. Give each part its own unrelated passphrase. List each part in `activities.json`. Announce the Part 2 code when you want the new information to arrive.

Answers carry from Part 1 to Part 2 only in the same browser on the same device. Otherwise, students restate their provisional recommendation from their downloaded Part 1 record. Ask students to submit both the Part 1 record and the final report.

## Edit the activity list

Each entry in `docs/data/activities.json` looks like this:

```json
{
  "id": "consultation-01",
  "title": "Bioethics Consultation",
  "topic": "Ethical Reasoning",
  "week": 1,
  "description": "Work through a consultation and explain your recommendation.",
  "durationMinutes": 45,
  "status": "available",
  "order": 1,
  "path": "activities/consultation-01.html"
}
```

| Field | Rules |
| --- | --- |
| `id` | Unique; lowercase letters, numbers, hyphens. |
| `title` | Required. |
| `topic`, `description` | Text, or `null`. |
| `week` | Whole number or `null`. Activities are grouped by week when set, otherwise by topic. |
| `durationMinutes` | Whole number or `null` (hidden when `null`). Don't guess: leave `null` until you know. |
| `order` | Number; lower appears first. |
| `path` | `activities/<name>.html`, or `null` if nothing is published yet. |
| `status` | See below. |

| `status` | On the homepage | What it means |
| --- | --- | --- |
| `available` | Folder with **Open case** and an **Access code required** stamp | The code prompt is reachable. Students still need the code. |
| `coming-soon` | Folder with a **Coming soon** stamp, no link | Display only. |
| `hidden` | Not shown | Display only. |

`coming-soon` and `hidden` only change the homepage. A file in `docs/activities/` can still be opened by anyone who knows its address, which is why every published activity must be encrypted.

Never put a code, or anything that hints at one, in this file.

The current list contains the two parts of *The Nurse Who Thought the Code Was Wrong* (draft 0.1, not yet approved), a working demonstration activity and two entries marked `[Placeholder]`. Replace or remove the placeholders when you add real activities. Change the demo's `status` to `hidden` (or delete its entry and file) once you no longer need it.

## Replace an activity or change its code

Edit the private original, run `tools/encrypt-activity.sh` again with the same filename (so links keep working), check, commit, and push. Test the live page.

Changing a code does **not** revoke access. Anyone who unlocked the old version may have saved it, and older encrypted versions remain in the public Git history.

## What this protects, and what it doesn't

This is practical control over *when* a class can open an activity. It is not identity verification or exam security.

- Students can share codes with each other.
- Once unlocked, an activity can be saved by the student.
- The code-entry screen asks for the code again after every reload. It doesn't remember codes.
- Nothing is collected centrally. Student work leaves the browser only through the activity's own report download, if it has one.

### Security settings built into the site

- **Content Security Policy.** Every page carries a policy in a `<meta>` tag, because GitHub Pages can't send security headers. The homepage may load only this site's own files. Activity pages may run only their own inline code, and the policy stays in force after the code is entered, so an activity can't fetch anything or send student answers anywhere. As a result, activities must be self-contained: images must be embedded (`data:` URLs) or placed next to the page, and nothing can load from other websites. `npm run check` fails if a page loses its policy.
- **No "remember me".** Codes aren't stored in the browser. `npm run check` fails if an activity was encrypted with remembering turned on.
- **No referrer.** Pages tell the browser not to pass their address to other sites.
- **Pre-publish checks** run on your computer before each commit and on GitHub on every push. They fail if a page in `docs/activities/` isn't encrypted, if any page other than the homepage is published, or if an unencrypted activity original is found anywhere in the repository.
- **Pinned tools.** StatiCrypt is pinned to an exact version, and the GitHub Actions in the check workflow are pinned to exact commits. Dependabot proposes updates to the actions as pull requests for you to review.

### Opening student reports

A downloaded report is an ordinary HTML file, and a student can edit it before submitting. Treat submitted `.html` files like any web page from an unknown source: open them in a web browser, and don't trust links inside them. If you'd rather avoid this, ask students to submit the **Print or save as PDF** version instead.

## Tool versions

- StatiCrypt **3.5.4**, pinned in `package.json` and `package-lock.json`. See the [StatiCrypt documentation](https://github.com/robinmoisson/staticrypt). If you upgrade it, re-check `tools/password_template.html` against the new version's default template.

## Automated check

`.github/workflows/check.yml` runs `npm run check` on every push and pull request. It fails if `activities.json` is broken, a listed activity file is missing, any page in `docs/activities/` is not encrypted with the site's security settings, any other page is published, or an unencrypted original is in the repository. The same check runs before each commit on your computer. That matters more, because by the time GitHub runs it, the commit is already public.
