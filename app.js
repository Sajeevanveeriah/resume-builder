/**
 * Resume Tailor — app.js
 * Vanilla JS, ES modules, no build step.
 * Compatible with file:// and GitHub Pages.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

const LS_KEY_RESUME  = 'resumeTailor_resumeText';
const LS_KEY_API_KEY = 'resumeTailor_apiKey';
const API_URL        = 'https://api.openai.com/v1/chat/completions';
const MODEL          = 'gpt-4o';
const TIMEOUT_MS     = 45_000;

const SYSTEM_PROMPT = `You are an expert Australian resume writer and ATS optimisation specialist with 15 years of experience placing candidates across engineering, technology, and professional services sectors.

RESUME RULES:
- Australian formatting: no photo, no DOB, no gender, no marital status, no nationality.
- Section order: Professional Summary, Key Skills (two-column keyword list), Work Experience (reverse chronological), Education, Certifications (omit section if none in source), Referees (write "Available upon request").
- Work Experience entry format: [Job Title] | [Company Name] | [City, State] | [Mon YYYY - Mon YYYY or Present]
- Under each role: 3-6 bullet points beginning with past-tense action verbs. Quantify with numbers/percentages only where the source resume provides data to support it.
- Mirror exact keywords, phrases, and terminology from the job description. Highest-density keyword placement: Professional Summary and Key Skills.
- ATS compliance: no tables, no columns, no text boxes, no headers/footers, no graphics, no special characters outside standard punctuation.
- Do not fabricate experience, skills, qualifications, dates, metrics, or employer names not present in the source resume.

COVER LETTER RULES:
- Australian business letter format. No "To Whom It May Concern". No "I am writing to apply for".
- If a company name is identifiable from the JD, address to: "Hiring Manager, [Company Name]"
- Structure:
  Para 1 (2 sentences): What the role is, why this specific company, what you bring at a headline level.
  Para 2 (3-4 sentences): Two strongest achievements from the resume that directly address stated JD requirements. Be specific.
  Para 3 (2-3 sentences): Skill or domain alignment. One forward-looking statement about contribution.
  Para 4 (2 sentences): Call to action. Availability for interview. Contact method.
- Tone: direct, confident, no filler phrases, no superlatives.
- Length: 260-320 words. Hard limit.

RESPONSE FORMAT: Return only valid JSON. No markdown fences, no preamble, no commentary.
{
  "resume": "<full resume, newlines as literal \\n>",
  "cover_letter": "<full cover letter, newlines as literal \\n>"
}`;

// ─── DOM references ───────────────────────────────────────────────────────────

const apiKeyInput       = document.getElementById('apiKeyInput');
const apiKeyToggle      = document.getElementById('apiKeyToggle');
const iconEye           = apiKeyToggle.querySelector('.icon-eye');
const iconEyeOff        = apiKeyToggle.querySelector('.icon-eye-off');
const resumeTextarea    = document.getElementById('resumeTextarea');
const pdfUpload         = document.getElementById('pdfUpload');
const saveResumeBtn     = document.getElementById('saveResumeBtn');
const clearResumeBtn    = document.getElementById('clearResumeBtn');
const saveFlash         = document.getElementById('saveFlash');
const pdfLoading        = document.getElementById('pdfLoading');
const jdTextarea        = document.getElementById('jdTextarea');
const tailorBtn         = document.getElementById('tailorBtn');
const btnLabel          = tailorBtn.querySelector('.btn-label');
const btnLoading        = tailorBtn.querySelector('.btn-loading');
const tailorHint        = document.getElementById('tailor-hint');
const errorBanner       = document.getElementById('errorBanner');
const errorMessage      = document.getElementById('errorMessage');
const errorDismiss      = document.getElementById('errorDismiss');
const progressArea      = document.getElementById('progressArea');
const outputArea        = document.getElementById('outputArea');
const parseWarning      = document.getElementById('parseWarning');
const resumeOutput      = document.getElementById('resumeOutput');
const coverOutput       = document.getElementById('coverOutput');
const copyResumeBtn     = document.getElementById('copyResumeBtn');
const downloadResumeBtn = document.getElementById('downloadResumeBtn');
const copyCoverBtn      = document.getElementById('copyCoverBtn');
const downloadCoverBtn  = document.getElementById('downloadCoverBtn');
const hamburgerBtn      = document.getElementById('hamburgerBtn');
const sidebar           = document.getElementById('sidebar');
const sidebarOverlay    = document.getElementById('sidebarOverlay');

// ─── Initialise from localStorage ────────────────────────────────────────────

function init() {
  const savedResume = safeLocalStorageGet(LS_KEY_RESUME);
  if (savedResume) resumeTextarea.value = savedResume;

  const savedKey = safeLocalStorageGet(LS_KEY_API_KEY);
  if (savedKey) apiKeyInput.value = savedKey;

  updateTailorButton();
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (err.name === 'QuotaExceededError' || err.code === 22) {
      showError('Storage quota exceeded. Please clear your saved resume and try again.');
    } else {
      showError(`Could not save to storage: ${err.message}`);
    }
    return false;
  }
}

function safeLocalStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

// ─── API key field ────────────────────────────────────────────────────────────

apiKeyInput.addEventListener('blur', () => {
  const val = apiKeyInput.value.trim();
  if (val) {
    safeLocalStorageSet(LS_KEY_API_KEY, val);
  } else {
    safeLocalStorageRemove(LS_KEY_API_KEY);
  }
});

apiKeyToggle.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  iconEye.style.display    = isPassword ? 'none' : '';
  iconEyeOff.style.display = isPassword ? '' : 'none';
  apiKeyToggle.setAttribute('aria-label', isPassword ? 'Hide API key' : 'Show API key');
});

// ─── Resume section ───────────────────────────────────────────────────────────

resumeTextarea.addEventListener('input', updateTailorButton);

saveResumeBtn.addEventListener('click', () => {
  const val = resumeTextarea.value.trim();
  if (!val) {
    showError('Nothing to save — the resume field is empty.');
    return;
  }
  const ok = safeLocalStorageSet(LS_KEY_RESUME, resumeTextarea.value);
  if (ok) {
    flashSaveConfirmation();
  }
});

clearResumeBtn.addEventListener('click', () => {
  if (!confirm('Clear your saved resume? This cannot be undone.')) return;
  safeLocalStorageRemove(LS_KEY_RESUME);
  resumeTextarea.value = '';
  updateTailorButton();
});

function flashSaveConfirmation() {
  saveFlash.hidden = false;
  setTimeout(() => { saveFlash.hidden = true; }, 2500);
}

// ─── PDF upload ───────────────────────────────────────────────────────────────

pdfUpload.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  pdfLoading.hidden = false;

  try {
    const text = await extractPdfText(file);
    resumeTextarea.value = text;
    updateTailorButton();
  } catch (err) {
    showError(`PDF extraction failed: ${err.message}`);
  } finally {
    pdfLoading.hidden = true;
    // Reset input so same file can be re-selected
    pdfUpload.value = '';
  }
});

async function extractPdfText(file) {
  // pdf.js 4.x uses ES module exports. We load it as type="module" in HTML
  // and access the global pdfjsLib or use the worker via CDN.
  const arrayBuffer = await file.arrayBuffer();

  // Try to get pdfjsLib from the global scope (set by the CDN module script)
  // The CDN build of pdf.js 4.x exposes itself via the module script tag.
  // Since our app.js is also type="module", we import it dynamically.
  let pdfjsLib;
  try {
    // pdf.js 4.x CDN mjs build
    const mod = await import(
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs'
    );
    pdfjsLib = mod;
  } catch {
    // Fallback: check if set on window by earlier script tag
    pdfjsLib = window.pdfjsLib;
  }

  if (!pdfjsLib) {
    throw new Error('pdf.js library could not be loaded. Check your internet connection.');
  }

  // Set worker source for pdf.js 4.x
  if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
  }

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;

  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    pageTexts.push(strings.join(' '));
  }

  return pageTexts.join('\n\n').replace(/\s{3,}/g, '\n').trim();
}

// ─── JD textarea ─────────────────────────────────────────────────────────────

jdTextarea.addEventListener('input', updateTailorButton);

// ─── Tailor button state ──────────────────────────────────────────────────────

function updateTailorButton() {
  const hasResume = resumeTextarea.value.trim().length > 0;
  const hasJD     = jdTextarea.value.trim().length > 0;
  const disabled  = !hasResume || !hasJD;

  tailorBtn.disabled = disabled;

  if (!hasResume && !hasJD) {
    tailorHint.textContent = 'Add your resume and job description to get started.';
  } else if (!hasResume) {
    tailorHint.textContent = 'Add your resume to continue.';
  } else if (!hasJD) {
    tailorHint.textContent = 'Paste a job description to continue.';
  } else {
    tailorHint.textContent = 'Ready to generate your tailored application.';
  }
}

// ─── Error banner ─────────────────────────────────────────────────────────────

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.hidden = false;
}

function hideError() {
  errorBanner.hidden = true;
  errorMessage.textContent = '';
}

errorDismiss.addEventListener('click', hideError);

// ─── Progress steps ───────────────────────────────────────────────────────────

const steps = [
  document.getElementById('step1'),
  document.getElementById('step2'),
  document.getElementById('step3'),
];

function resetSteps() {
  steps.forEach(s => {
    s.classList.remove('active', 'done');
  });
}

function activateStep(index) {
  steps.forEach((s, i) => {
    if (i < index) {
      s.classList.remove('active');
      s.classList.add('done');
    } else if (i === index) {
      s.classList.remove('done');
      s.classList.add('active');
    } else {
      s.classList.remove('active', 'done');
    }
  });
}

function completeAllSteps() {
  steps.forEach(s => {
    s.classList.remove('active');
    s.classList.add('done');
  });
}

// ─── Main generation flow ─────────────────────────────────────────────────────

tailorBtn.addEventListener('click', handleTailor);

async function handleTailor() {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showError('Please enter your OpenAI API key in the sidebar before generating.');
    apiKeyInput.focus();
    return;
  }

  const resumeText = resumeTextarea.value.trim();
  const jdText     = jdTextarea.value.trim();

  if (!resumeText || !jdText) return; // button should be disabled, safety net

  hideError();
  setLoading(true);
  outputArea.hidden = true;
  parseWarning.hidden = true;

  // Show progress
  progressArea.hidden = false;
  resetSteps();
  activateStep(0);

  // Animate steps to give perceived feedback
  const step2Timer = setTimeout(() => activateStep(1), 6_000);
  const step3Timer = setTimeout(() => activateStep(2), 18_000);

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `SOURCE RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jdText}`,
          },
        ],
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errBody = await response.json();
        if (errBody?.error?.message) {
          errMsg = errBody.error.message;
        }
      } catch {
        // use default message
      }
      throw new APIError(errMsg);
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content ?? '';

    completeAllSteps();

    // Small pause so user sees all steps complete
    await delay(500);

    progressArea.hidden = true;
    renderOutput(rawContent);

  } catch (err) {
    clearTimeout(step2Timer);
    clearTimeout(step3Timer);
    progressArea.hidden = true;
    resetSteps();

    if (err.name === 'AbortError') {
      showError('Request timed out after 45 seconds. The API may be busy — please try again.');
    } else if (err instanceof APIError) {
      showError(err.message);
    } else {
      showError(`Unexpected error: ${err.message}`);
    }
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(step2Timer);
    clearTimeout(step3Timer);
    setLoading(false);
  }
}

class APIError extends Error {
  constructor(message) {
    super(message);
    this.name = 'APIError';
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Loading state ────────────────────────────────────────────────────────────

function setLoading(loading) {
  tailorBtn.disabled = loading;
  if (loading) {
    btnLabel.hidden  = true;
    btnLoading.hidden = false;
  } else {
    btnLabel.hidden  = false;
    btnLoading.hidden = true;
    // Re-evaluate disabled state based on content
    updateTailorButton();
  }
}

// ─── Output rendering ─────────────────────────────────────────────────────────

function renderOutput(rawContent) {
  let resume = '';
  let coverLetter = '';
  let parseError = false;

  const cleaned = rawContent.trim();

  try {
    // Strip markdown fences if model disobeys instructions
    const jsonStr = cleaned
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    const parsed = JSON.parse(jsonStr);
    resume      = parsed.resume      ?? '';
    coverLetter = parsed.cover_letter ?? '';

    if (!resume && !coverLetter) {
      throw new Error('Empty fields in parsed JSON');
    }
  } catch {
    parseError = true;
    // Show raw content
    resume = cleaned;
    coverLetter = '';
  }

  // Normalise literal \n sequences in case model double-escapes
  resume      = unescapeNewlines(resume);
  coverLetter = unescapeNewlines(coverLetter);

  resumeOutput.textContent = resume;
  coverOutput.textContent  = coverLetter || '(No cover letter returned — see resume above)';

  parseWarning.hidden = !parseError;
  outputArea.hidden   = false;

  // Scroll output into view smoothly
  outputArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function unescapeNewlines(str) {
  // Replace literal backslash-n sequences with real newlines
  // Only if the string doesn't already contain real newlines (model-dependent)
  return str.replace(/\\n/g, '\n');
}

// ─── Copy to clipboard ────────────────────────────────────────────────────────

copyResumeBtn.addEventListener('click', () => {
  copyToClipboard(resumeOutput.textContent, copyResumeBtn);
});

copyCoverBtn.addEventListener('click', () => {
  copyToClipboard(coverOutput.textContent, copyCoverBtn);
});

async function copyToClipboard(text, button) {
  if (!text.trim()) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for file:// or older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }

  const originalHTML = button.innerHTML;
  button.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
    Copied!
  `;
  button.classList.add('copied');

  setTimeout(() => {
    button.innerHTML = originalHTML;
    button.classList.remove('copied');
  }, 2000);
}

// ─── Download as .txt ─────────────────────────────────────────────────────────

downloadResumeBtn.addEventListener('click', () => {
  downloadText(resumeOutput.textContent, 'tailored-resume.txt');
});

downloadCoverBtn.addEventListener('click', () => {
  downloadText(coverOutput.textContent, 'cover-letter.txt');
});

function downloadText(text, filename) {
  if (!text.trim()) return;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

// ─── Mobile sidebar toggle ────────────────────────────────────────────────────

hamburgerBtn.addEventListener('click', toggleSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

// Close sidebar on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sidebar.classList.contains('open')) {
    closeSidebar();
  }
});

function toggleSidebar() {
  const isOpen = sidebar.classList.contains('open');
  isOpen ? closeSidebar() : openSidebar();
}

function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('visible');
  hamburgerBtn.setAttribute('aria-expanded', 'true');
  // Trap focus inside sidebar on mobile
  sidebar.querySelector('input, button, textarea, [tabindex]')?.focus();
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('visible');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
  hamburgerBtn.focus();
}

// ─── Keyboard accessibility for label-as-button ───────────────────────────────

document.querySelectorAll('label.btn').forEach(label => {
  label.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      // Trigger the associated input
      const input = document.getElementById(label.getAttribute('for'));
      input?.click();
    }
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
