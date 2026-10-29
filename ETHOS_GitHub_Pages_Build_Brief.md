# ETHOS Bioethics Course Website Build Brief

## Purpose

Build a simple course website that hosts interactive HTML bioethics activities on GitHub Pages. Students browse the activities without creating accounts. Each activity requires its own shared access code, which the instructor distributes when the class is ready.

The priorities are free hosting, minimal maintenance, and reuse of existing HTML activities. The first version should be a small static website, with no custom backend, database, or account system.

This document is a specification for the initial build. The website and protected activity files still need to be implemented and tested.

## Agreed requirements

- Host the website on GitHub Pages using a public repository and the included `github.io` address.
- Do not require student accounts, email addresses, or sign-in.
- Do not build an instructor sign-in or administration dashboard into the website.
- The instructor manages the published files and activity list through their GitHub account. Do not grant other people repository write access.
- Give each activity its own shared access code.
- Protect the activity contents with encryption, rather than a JavaScript check that merely hides an otherwise readable page.
- Let the instructor show, hide, reorder, and categorize activities by editing one readable settings file.
- Keep the original HTML activities and access codes outside the public repository.
- Preserve the activities' existing behavior, including any report downloads.
- Make the homepage and code-entry screens readable on phones and usable with a keyboard.

No paid hosting, purchased domain, paid plugins, or recurring external services are required for this initial design. GitHub's free service remains subject to its published usage limits.

## Student experience

1. Open the course website using one shared course link.
2. Browse activity cards organized by topic or week.
3. Select an activity that is available.
4. See a clearly labeled screen asking for the activity code.
5. Enter the code provided by the instructor.
6. Complete the activity in the browser.
7. Use the activity's existing report download or export feature, if present.

Show a helpful message after an incorrect code and allow another attempt. Do not erase the entered code without a reason. Provide an accessible show/hide control for the code field and a link back to the course homepage.

Do not collect student work centrally in this version. Any saving or report export must be described according to what the individual activity actually supports. Opening the site does not create a student record or automatically submit work to the instructor.

## Activity protection

Use [StatiCrypt](https://github.com/robinmoisson/staticrypt), or an equivalently reviewed static HTML encryption tool. StatiCrypt supports encrypted HTML pages that decrypt inside the browser and can be hosted on GitHub Pages without a backend.

### Publishing model

The instructor's original activity file is encrypted locally using its chosen access code. Only the resulting protected HTML file is copied into the public website repository.

```text
Original HTML kept privately
          |
          | Local encryption using the activity's code
          v
Protected HTML copied into the public repository
          |
          | GitHub Pages publishes the file
          v
Student enters the code and the browser unlocks the activity
```

Use a maintained, pinned tool version and record it in the maintenance instructions. Check the tool's official documentation when implementing the encryption workflow. Use its supported password-entry method so codes are not written into shared scripts or command history.

### Required boundaries

- Never put original activity HTML, actual codes, decrypted exports, or password mappings in the public repository, including its commit history.
- Do not put a plaintext code or a reversible encoded code into the homepage or settings file.
- Keep private source files in a separate local folder outside the website repository. A `.gitignore` file is an additional safeguard; it does not remove files already committed.
- Protect the activity itself, so opening its direct address still shows the code prompt.
- Review external assets. Encrypting the HTML does not automatically encrypt linked JavaScript files, images, PDFs, or other downloads. Sensitive case content must not remain in publicly readable supporting files.
- Start with self-contained HTML activities when possible. Preserve relative paths and test any supporting files that remain necessary.

Prefer longer, unique passphrases over short numeric codes. Students can share any code they receive. Once someone unlocks an activity, they can save its contents. Changing a code requires encrypting and publishing a new version and cannot revoke copies already saved or older encrypted versions available through public history.

The purpose is practical control over classroom release, rather than individual identity verification, exam security, or guaranteed revocation.

## Homepage and activity settings

Use one small JSON file to control the activity list. It contains public descriptions and display settings, never codes or original activity content.

Example structure, using illustrative activities rather than claims about existing files:

```json
{
  "courseTitle": "ETHOS Bioethics Activities",
  "courseDescription": "Interactive cases for ethical inquiry and discussion.",
  "activities": [
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
    },
    {
      "id": "case-02",
      "title": "Next Case",
      "topic": "Consent",
      "week": 2,
      "description": "A forthcoming classroom activity.",
      "durationMinutes": 30,
      "status": "coming-soon",
      "order": 2,
      "path": null
    }
  ]
}
```

### Status behavior

| Status | Homepage behavior | Access meaning |
| --- | --- | --- |
| `available` | Show a card with an Open Activity link and an Access code required label. | The link leads to the encrypted activity. Students still need the code. |
| `coming-soon` | Show a card with a Coming soon label and no active activity link. | Display status only. It does not secure a file that has already been published. |
| `hidden` | Omit the activity from the homepage. | Display status only. Any published activity must still be encrypted. |

Do not call the `available` state publicly unlocked: it means the code-entry page is available. The instructor releases access by sharing the code.

Leave date-based display changes out of the first version. They can be added later if useful, but browser-based dates must not be treated as secure release controls.

Validate the settings file. If it is missing or malformed, show a readable message rather than an empty page. Reject broken entries during local checks. Render text safely and allow only appropriate relative activity paths.

## Visual direction

Create a calm, readable course library with a clear title, brief instructions, and activity cards. Use strong typography, generous spacing, and a restrained navy, teal, and neutral palette. Text should be the main content; decorative images are optional.

Each card should show the activity title, topic or week, short description, approximate duration when known, and availability label. Do not invent durations or course content in production entries. Use visibly marked placeholders until the instructor supplies the details.

Use a responsive grid that becomes a single column on small screens. Include visible keyboard focus, descriptive links, persistent input labels, sufficient text contrast, and status text that does not depend on color alone. Style the code prompt to feel like part of the same website.

The homepage should link to activities as separate pages. Avoid embedding them in frames in the first version, since direct pages simplify layout and report-download testing.

## Suggested file organization

Keep the private authoring workspace separate from the public repository:

```text
Private local authoring folder — never uploaded
  originals/
    consultation-01.html
  protected-output/
    consultation-01.html
  code-record-kept-privately

Public GitHub repository
  docs/
    index.html
    .nojekyll
    assets/
      styles.css
      app.js
    data/
      activities.json
    activities/
      consultation-01.html        # encrypted version only
  README.md
  .gitignore
```

Configure GitHub Pages to publish the `docs` folder on the `main` branch. Use relative links that also work when the website is served beneath a repository name. Avoid assuming the site is at the domain root.

The homepage can use ordinary HTML, CSS, and JavaScript. It should not require a frontend framework or a homepage build process. Encryption is a separate local preparation step.

## Instructor maintenance workflow

### Add an activity

1. Finish and test the original HTML activity in the private authoring folder.
2. Choose its code and record that code privately.
3. Generate its encrypted version locally.
4. Copy only the encrypted file and any reviewed supporting assets into the public repository.
5. Add its entry to `activities.json`.
6. Publish the changes through GitHub and wait for the Pages deployment to finish.
7. Open the published activity, check its code prompt, and test the correct code.
8. Share the code with students when ready.

### Change visibility

Edit the activity's `status` in `activities.json` and publish the change. This updates the shared homepage after deployment; it is not a private toggle saved only in the instructor's browser.

### Replace an activity or change its code

Edit the private original, encrypt it again, and replace the published protected file. Keep its filename stable if existing links should continue to work. Test the published replacement. Explain that replacement does not invalidate previously saved copies.

### Initial GitHub setup

Create a public repository, upload the prepared website files, and select **Settings → Pages → Deploy from a branch → main → /docs**. Use the resulting GitHub Pages address as the course link. The instructor needs a GitHub account to manage publication; students do not.

Follow the current [GitHub Pages publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). Updates are not instantaneous; GitHub documents that publication can take up to ten minutes.

## First build and verification

Build the homepage, settings reader, and one complete sample activity protected with a privately supplied test passphrase. If no real activity is supplied, use a clearly labeled demonstration activity rather than inventing a course case. Do not place the test passphrase in the public files.

Verify these acceptance criteria:

- The homepage runs from a local web server and works with a GitHub Pages project subpath.
- Available, coming-soon, and hidden entries display according to the settings.
- An activity's direct address shows its code prompt.
- An incorrect code fails with a readable message; the correct code opens the activity.
- Activity text is not present in readable form in the published encrypted HTML or public supporting files.
- Navigation, interactions, and any report download work after decryption.
- The activity works on a narrow screen and can be entered using a keyboard.
- Reload and any remember-code behavior match the instructions. Prefer requiring the code again over silently remembering it for all activities in the first version.
- The public file list contains no original activity files or codes, and the repository history has not exposed them.
- All published links work, and placeholder content is visibly labeled.

Hand off the website files, a short README covering the instructor workflow, and a concise verification record. Identify which checks were performed locally and which still require a live GitHub Pages deployment. Do not claim the site has been published until deployment is verified.

## Scope boundaries

Do not add student accounts, instructor dashboards, analytics, grading, central submissions, progress databases, paid services, or course-platform integrations to the first version. Do not publish or modify a GitHub repository until the instructor identifies the destination and asks for that step.

## Copy-ready instruction for a coding agent

> Build the local website described in this brief. Use buildless HTML, CSS, and JavaScript suitable for GitHub Pages, with one JSON activity list and encrypted per-activity HTML files. Preserve the no-account, no-backend, free-hosting requirements. Keep originals and codes outside the public repository. Implement and test one complete activity path before expanding the library. Provide the finished website files and simple maintenance instructions. Prepare for GitHub Pages publication, but wait for an identified repository and a request to publish before changing GitHub. Follow the requirements and acceptance criteria above, and report any verification that remains incomplete.

## Reference documentation

- [What is GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Configure a GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Create a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [StatiCrypt documentation and source](https://github.com/robinmoisson/staticrypt)
