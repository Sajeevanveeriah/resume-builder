# Resume Tailor

Resume Tailor is a fully client-side web application that generates ATS-optimised resumes and cover letters tailored to a specific job advertisement. Paste your existing resume, paste a job description, supply your OpenAI API key, and the app calls GPT-4o with a specialist Australian resume-writing prompt to produce a keyword-matched resume and a concise, direct cover letter — all in your browser, with no server, no sign-up, and no data ever leaving your machine except for the single API call to OpenAI.

## Setup

### 1. Get an OpenAI API key

Visit [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys), create an account if needed, and generate a new secret key. Keep it safe — you'll paste it into the app sidebar.

### 2. Run locally

```bash
git clone https://github.com/<your-username>/resume-tailor.git
cd resume-tailor
```

Open `index.html` directly in your browser:

- **macOS:** `open index.html`
- **Windows:** Double-click `index.html` in Explorer
- **Linux:** `xdg-open index.html`

No build step, no `npm install`, no server required.

### 3. Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Source**, select the branch (`main` or `master`) and set the folder to `/ (root)`.
4. Save. GitHub will publish the app at `https://<your-username>.github.io/<repo-name>/`.

The app works identically on `file://` and `https://` — there is no server-side component.

## Usage

1. Enter your OpenAI API key in the sidebar (saved to `localStorage` on blur).
2. Paste your resume text into the **My Resume** textarea, or click **Upload PDF** to extract text from a PDF automatically.
3. Click **Save** to persist your resume across sessions.
4. Paste the full job advertisement into the **Job Description** field.
5. Click **Tailor My Application**.
6. Copy or download the tailored resume and cover letter from the output cards.

## Privacy & Security

> Your OpenAI API key and resume text are stored **only in your browser's `localStorage`**. They are never transmitted to any server other than OpenAI's API endpoint (`api.openai.com`) at the moment you click **Tailor My Application**. No analytics, no tracking, no third-party services receive your data.

## Dependencies (CDN only)

| Library | Purpose | CDN |
|---|---|---|
| pdf.js 4.0.379 | Client-side PDF text extraction | cdnjs.cloudflare.com |
| JetBrains Mono | Output typography | Google Fonts |
| Inter | UI typography | Google Fonts |

All dependencies load from public CDNs. No `node_modules`, no `package.json`.
