# ResumeAI

ResumeAI is a complete resume tailoring web application that runs entirely in your browser. Paste your existing resume, paste a job advertisement, and the app produces an ATS-optimised tailored resume and a concise Australian-format cover letter — with zero data leaving your device.

## How it works

The AI (Phi-3-mini-4k-instruct) runs locally in your browser via [Transformers.js](https://huggingface.co/docs/transformers.js) over WebAssembly. No API keys. No backend. No external AI services. Your resume and job description never leave your machine.

- **Resume tailoring**: Mirrors exact keywords from the job description, applies Australian formatting standards, and produces ATS-safe output.
- **Cover letter**: Direct, confident Australian business letter format, 260–320 words, structured to map your achievements to the role.
- **PDF upload**: Extract text from a PDF resume client-side using pdf.js — no upload to any server.
- **Resume persistence**: Your resume text is saved to `localStorage` and pre-filled on every visit.

## Browser compatibility

Works in all modern browsers — Chrome, Firefox, Safari, Edge — with no flags or special settings required. WebAssembly is universally supported.

## First-load model download

On the first visit, the browser downloads the Phi-3-mini model (~400MB) from Hugging Face Hub. This is cached by the browser after the first load, so subsequent visits are instant. The progress bar shows download status in real time.

## Running locally

You must serve the files via a local HTTP server (not `file://`) because module workers require HTTP. Use any static server:

```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# Node.js (http-server)
npx http-server -p 8080
```

Then open `http://localhost:8080` in your browser.

## Deployment to GitHub Pages

1. Commit all files including `transformers.min.js` to your repository.
2. Push to GitHub.
3. Go to **Settings → Pages**, set source to the `main` branch, root folder.
4. GitHub Pages will serve the app at `https://<username>.github.io/<repo>/`.

**Note:** `transformers.min.js` is vendored and must be committed to the repository. It is the bundled Transformers.js library (~877KB) that the worker loads locally — no CDN calls are made for this file.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell, sidebar, main area, CDN links for fonts and pdf.js |
| `style.css` | All styles — dark sidebar, light main area, green accent |
| `app.js` | Main UI logic, worker communication, stream parsing, PDF extraction |
| `worker.js` | Module worker — loads Phi-3-mini, streams generated tokens |
| `transformers.min.js` | Vendored Transformers.js library (from `@xenova/transformers`) |

## Mock mode

Append `?mock=1` to the URL to run the app without loading the AI model. Useful for UI testing and development.

## Privacy

No data leaves your device. The model runs entirely in your browser. The only network requests are:
- Google Fonts (JetBrains Mono, loaded in `index.html`)
- pdf.js from cdnjs (loaded in `index.html`)
- The Phi-3-mini model weights from Hugging Face Hub (first load only, then cached)
