# ResumeAI

A static browser application for tailoring an existing resume to a supplied job description and generating a matching cover letter through the Groq chat-completions API. The repository has no application server or build step: `index.html`, `style.css` and `app.js` are deployed directly to GitHub Pages.

## Data and trust boundaries

The application handles three materially different kinds of data:

- resume text can be persisted in browser `localStorage` under `resume_text`;
- the Groq API key is held in `sessionStorage` under `groq_key` and sent to the configured Groq endpoint when generating content;
- job-description and generated-output text are held in page state unless copied/downloaded by the user.

The browser-only architecture does **not** mean prompts stay entirely on-device: generation sends the resume/job-description content required by the request to the external Groq API. Keep this distinction explicit when changing privacy copy.

## Runtime flow

1. Resume text is pasted or extracted from an uploaded PDF in the browser.
2. A job description and API key are supplied.
3. `app.js` sends a resume-tailoring request and then a cover-letter request using streaming chat completions.
4. Server-sent streaming chunks are decoded incrementally into the output panels.
5. The app calculates a simple lexical ATS keyword-coverage score from the generated resume and job description.
6. Outputs can be copied, downloaded as text or printed through the browser's PDF workflow.

The ATS percentage is a repository-defined lexical heuristic, not a score from an applicant-tracking vendor and not a guarantee of screening performance.

## Repository map

See [`CODE-MAP.md`](CODE-MAP.md) for the complete responsibility map. The key boundaries are:

- `index.html`: semantic UI, forms, output containers and PDF.js/browser dependencies;
- `style.css`: screen, responsive and print presentation;
- `app.js`: prompts, browser storage, PDF text extraction, API streaming, ATS heuristic and export interactions;
- `.github/workflows/deploy.yml`: static GitHub Pages deployment.

## API key handling

The API key is intentionally session-scoped. Do not move it to `localStorage`, source code, query parameters or committed configuration. The `.env.example` file is reference configuration only; this static client must not embed a secret during deployment.

## Model/prompt maintenance

Model identifiers, prompt wording, endpoint format and response-stream parsing are external API contracts and can become stale independently of the UI. When changing them:

1. verify the current provider API/model availability;
2. preserve the factuality rule that prohibits inventing experience, dates, qualifications or metrics;
3. test non-200 responses and interrupted streams;
4. review user-facing privacy wording if the data sent externally changes.

## Local use

No package installation is required for the deployed application. Serve the repository through a local static HTTP server for development so browser PDF/module/network behaviour matches hosted use more closely than `file://` loading.

## Deployment

`.github/workflows/deploy.yml` publishes the static repository content to GitHub Pages. There is no server-side secret injection layer in this architecture.

## Verification priorities

After implementation changes, verify:

1. resume persistence and clear/save behaviour;
2. API key survives only the intended browser session;
3. PDF upload extracts usable text and reports failures clearly;
4. resume and cover-letter streams complete independently and expose API/network errors;
5. ATS keyword score handles empty/minimal job descriptions and remains described as a heuristic;
6. copy, text download and print/PDF paths use the correct output;
7. responsive sidebar and output layout remain usable;
8. GitHub Pages deployment still serves all static assets.

## Commenting rule

Comments should explain external API contracts, secret/storage boundaries, stream parsing, PDF extraction, ATS-scoring assumptions and non-obvious export/browser behaviour. Avoid comments that merely narrate DOM assignments or CSS declarations.
