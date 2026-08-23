markdown

# Local File Toolkit



Resize, compress, convert, merge and split images and PDFs **entirely in your

browser**. There is no upload endpoint, no database and no server-side storage.



## Deploy



**GitHub Pages**

1. Push this repo to GitHub.

2. Settings → Pages → Source: `Deploy from a branch`, branch `main`, folder `/ (root)`.

3. Live at `https://USER.github.io/REPO/`. All paths are relative, so subpaths work.



**Netlify** — drag the folder into the Netlify dashboard, or connect the repo.

No build command; publish directory `.`.



## Architecture



- `assets/js/tools/*` — each tool is a declarative object (`fields` + `run()`).

  Adding a tool means adding one object and registering it in `tools/index.js`.

  No changes to the UI shell are needed.

- `assets/js/queue.js` — concurrent job queue. Runs up to

  `navigator.hardwareConcurrency` (capped 2–6) jobs at once, with per-job

  progress and cancellation. Drop more files while others are running.

- `assets/js/pool.js` + `workers/image.worker.js` — worker pool. Image decode,

  resize and encode happen off the main thread on `OffscreenCanvas`, so the UI

  stays responsive with dozens of files.

- `assets/js/bytes.js` — byte-level JPEG/PNG surgery: lossless metadata# doc-convertor
