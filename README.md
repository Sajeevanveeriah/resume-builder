# ResumeAI

ResumeAI is a pure client-side web application that takes your existing resume text and a job advertisement and instantly produces an ATS-optimised tailored resume and a concise Australian-format cover letter — with zero network calls, zero AI model, zero API keys, and zero accounts required. All text processing is done in your browser using deterministic JavaScript: the app extracts keywords from the job description by frequency analysis, parses your resume into structured sections (name, contact, summary, skills, experience, education, certifications), rewrites work experience bullet points with strong action verbs, injects relevant job-description keywords into the professional summary and skills list, and generates a 260–320 word cover letter mapped to the two most recent roles. Results appear the instant you click the button. Your resume is saved to browser `localStorage` and never leaves your device. A PDF upload option extracts text client-side via pdf.js. After the initial page load (which fetches only fonts and pdf.js from CDNs), the application requires no internet connection to function.

## Deployment

Push the three files (`index.html`, `style.css`, `app.js`) to a GitHub repository, enable GitHub Pages on the `main` branch from the repository's Settings → Pages, and the app is live. No build step, no server, no configuration.
