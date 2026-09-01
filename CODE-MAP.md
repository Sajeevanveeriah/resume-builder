# ResumeAI Code Map

## `app.js`

Complete client-side application controller.

### Configuration and prompts

- `LS_RESUME_KEY` and `SESSION_KEY` define the browser persistence boundary for resume text and the API key.
- `GROQ_ENDPOINT` and the model identifier are external provider contracts.
- `RESUME_SYSTEM_PROMPT` and `COVER_SYSTEM_PROMPT` constrain generated content, including the critical rule against inventing candidate facts.
- `CHAR_SOFT_LIMIT` is a UI warning threshold rather than a hard provider-token limit.

### DOM/application state

The `DOMContentLoaded` handler resolves all controls/output nodes and wires the application. Changes to element IDs in `index.html` must be mirrored here.

### Input/readiness and progress

Helpers manage button enablement, resume-length warnings, errors, skeleton output, step state and word counts. These functions are presentation state and should not be mixed with API/storage side effects.

### ATS keyword heuristic

`computeAtsScore()` lowercases/tokenises the job description, removes a fixed stopword set, deduplicates remaining words longer than three characters and checks substring presence in the generated resume.

This is a lexical coverage heuristic. It does not model an actual ATS ranking algorithm and should never be labelled as a vendor-certified score.

### Groq streaming

`streamGroq()`:

- sends the API key through the `Authorization` header;
- posts system/user messages to the chat-completions endpoint;
- requests streaming output;
- maps common HTTP failures to user-readable messages;
- incrementally parses `data:` lines from the response stream;
- appends returned delta content to the correct output panel.

Provider changes can affect endpoint, model name, payload fields and stream format. Verify against current provider documentation before modifying this path.

### Generation orchestration

`processApplication()` validates inputs, generates the tailored resume first, then the cover letter, updates progress/error state and calculates word/ATS summaries after both outputs complete. Do not accidentally use generated resume text as the factual source for claims not present in the original input.

### Browser storage

Resume text may persist in `localStorage`. The API key is intentionally restricted to `sessionStorage`. Keep these storage classes distinct because changing them changes the privacy/lifetime contract.

### PDF import

The PDF path uses browser-side PDF parsing to extract text. Treat uploaded PDF bytes/text as user data; extraction failures should remain explicit rather than silently producing an empty resume.

### Copy/download/PDF export

Copy uses the Clipboard API with a selection fallback. Text export uses a temporary Blob URL. PDF export uses the browser print path and print-specific body classes/styles rather than generating a server-side PDF.

## `index.html`

Static semantic/application shell. Owns labels, inputs, sidebar, progress indicators, generated-output panels, error region and script/library loading. Element IDs are an interface consumed by `app.js`.

## `style.css`

Complete screen, responsive and print stylesheet. Print classes used by `exportPdf()` are a JavaScript/CSS contract: rename them in both places together.

## `.github/workflows/deploy.yml`

GitHub Pages deployment for the static root. This workflow should never inject a long-lived API secret into browser assets.

## `.env.example`

Developer/reference configuration. A value placed in a client-side build/static application is not secret merely because it came from an environment variable.

## `.gitignore`

Prevents local/generated files from entering source control. Keep API keys and local secret material excluded.

## Safe change order

1. Identify whether the change is UI, storage/privacy, PDF parsing, provider API, prompts or export.
2. Keep the original resume as the factual source of candidate claims.
3. Preserve API-key session lifetime unless a deliberate privacy design change is approved.
4. Verify provider endpoint/model/stream format for API changes.
5. Exercise error and interrupted-stream paths as well as the success path.
6. Recheck print output if HTML/CSS/output structure changes.
7. Verify GitHub Pages after path/workflow changes.
