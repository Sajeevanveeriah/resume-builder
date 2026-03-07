# ResumeAI (Local-Only Transformers.js Resume Tailoring)

ResumeAI is a fully client-side web app that tailors a resume and drafts a matching cover letter from a job description.

## What the app does

- Loads an AI model directly in your browser with **Transformers.js**.
- Uses **Xenova/Phi-3-mini-4k-instruct** for local generation.
- Runs model inference inside a **Web Worker** so the UI stays responsive.
- Accepts your resume text by paste or PDF upload (parsed locally with pdf.js).
- Accepts a target job description and generates:
  - an ATS-friendly tailored resume
  - a matching cover letter
- Streams output live and splits the two documents using a separator.
- Lets you copy or download each output as `.txt`.

## Privacy and local processing

- The AI runs entirely in your browser via WebAssembly.
- No backend server is used.
- No API keys are required.
- No external AI service calls are made.
- Resume/job data stays on your device.

## Browser requirements

Works in all modern browsers that support WebAssembly, including:

- Chrome
- Firefox
- Safari
- Edge

## First-load model download

On first run, the app downloads the model (~400MB). This may take several minutes depending on your network.

- A top progress bar shows download/loading status.
- Model files are cached by the browser for future visits.

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In repository settings, open **Pages**.
3. Set source to the `main` branch (root).
4. Save — deployment runs automatically.

No backend setup is needed.

## Setup notes

`transformers.min.js` is vendored in the repository. No CDN dependency at runtime. To update the model library, replace this file with a newer build from jsDelivr (package `@xenova/transformers`).
