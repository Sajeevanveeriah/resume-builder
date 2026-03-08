const MOCK_MODE = window.location.search.includes('mock=1');

const SYSTEM_PROMPT = `You are an expert Australian resume writer and ATS optimisation specialist.

RESUME RULES:
- Australian formatting: no photo, no DOB, no gender, no marital status, no nationality.
- Section order: Professional Summary, Key Skills, Work Experience (reverse chronological), Education, Certifications (omit if none in source), Referees ("Available upon request").
- Work Experience format: [Job Title] | [Company] | [City, State] | [Mon YYYY - Mon YYYY]
- Bullet points per role: 3-6, strong past-tense action verbs. Quantify only where source data supports it.
- Mirror exact keywords and phrases from the job description. Highest concentration in Professional Summary and Key Skills.
- ATS safe: no tables, no columns, no graphics, no special characters beyond standard punctuation.
- Do not fabricate any experience, dates, metrics, qualifications, or employer names not present in the source resume.

COVER LETTER RULES:
- Australian business letter format. No "To Whom It May Concern". No "I am writing to apply for".
- Address to "Hiring Manager, [Company]" if company name is identifiable from the JD.
- Structure: Para 1 (hook: role, company, headline value). Para 2 (two specific achievements from resume mapped to JD). Para 3 (skills alignment, forward-looking contribution). Para 4 (call to action, availability).
- Tone: direct, confident, no filler, no superlatives.
- Length: 260-320 words hard limit.

OUTPUT FORMAT:
Write the resume in full. Then insert exactly this separator on its own line:
---COVER_LETTER---
Then write the cover letter. No preamble, no commentary, no labels other than the separator.`;

const LS_RESUME_KEY = 'resume_text';
const LS_NOTICE_KEY = 'model_notice_dismissed';
const SEPARATOR = '---COVER_LETTER---';

let worker = null;
let workerReady = false;
let generating = false;
let accumulatedText = '';
let separatorFound = false;
let separatorIndex = -1;

const elProgressArea    = document.getElementById('progress-area');
const elProgressBarFill = document.getElementById('progress-bar-fill');
const elProgressStatus  = document.getElementById('progress-status');
const elProgressLabel   = document.getElementById('progress-label');
const elReadyIndicator  = document.getElementById('ready-indicator');
const elNoticeBanner    = document.getElementById('notice-banner');
const elNoticeDismiss   = document.getElementById('notice-dismiss');
const elMockBanner      = document.getElementById('mock-banner');
const elErrorArea       = document.getElementById('error-area');
const elErrorMessage    = document.getElementById('error-message');
const elErrorDismiss    = document.getElementById('error-dismiss');
const elErrorRetry      = document.getElementById('error-retry');
const elResumeTextarea  = document.getElementById('resume-textarea');
const elSaveBtn         = document.getElementById('save-btn');
const elClearBtn        = document.getElementById('clear-btn');
const elUploadBtn       = document.getElementById('upload-btn');
const elFileInput       = document.getElementById('file-input');
const elJdTextarea      = document.getElementById('jd-textarea');
const elGenerateBtn     = document.getElementById('generate-btn');
const elOutputArea      = document.getElementById('output-area');
const elResumePre       = document.getElementById('resume-output');
const elCoverPre        = document.getElementById('cover-output');
const elResumeCopy      = document.getElementById('resume-copy');
const elResumeDownload  = document.getElementById('resume-download');
const elCoverCopy       = document.getElementById('cover-copy');
const elCoverDownload   = document.getElementById('cover-download');
const elHamburger       = document.getElementById('hamburger-btn');
const elSidebar         = document.getElementById('sidebar');

function showError(message, showRetry) {
  elErrorMessage.textContent = message;
  elErrorRetry.style.display = showRetry ? 'inline-flex' : 'none';
  elErrorArea.hidden = false;
  elErrorArea.classList.add('visible');
}

function hideError() {
  elErrorArea.hidden = true;
  elErrorArea.classList.remove('visible');
}

function updateGenerateButton() {
  const canGenerate = workerReady
    && elResumeTextarea.value.trim().length > 0
    && elJdTextarea.value.trim().length > 0
    && !generating;
  elGenerateBtn.disabled = !canGenerate;
}

function handleWorkerMessage(event) {
  const msg = event.data;

  if (msg.type === 'progress') {
    const pct = Math.min(1, Math.max(0, msg.progress || 0));
    elProgressBarFill.style.width = (pct * 100) + '%';
    elProgressStatus.textContent = msg.status || '';
    elProgressArea.hidden = false;
  } else if (msg.type === 'ready') {
    workerReady = true;
    elProgressBarFill.style.width = '100%';
    elProgressLabel.textContent = 'AI ready';
    elProgressStatus.textContent = '';
    elReadyIndicator.style.display = 'inline-block';
    updateGenerateButton();
    setTimeout(() => {
      elProgressArea.classList.add('fade-out');
      setTimeout(() => {
        elProgressArea.hidden = true;
        elProgressArea.classList.remove('fade-out');
      }, 600);
    }, 3000);
  } else if (msg.type === 'token') {
    handleToken(msg.text);
  } else if (msg.type === 'done') {
    generating = false;
    elGenerateBtn.disabled = false;
    elGenerateBtn.textContent = 'Tailor My Application';
    elGenerateBtn.classList.remove('generating');
    enableOutputButtons();
    updateGenerateButton();
  } else if (msg.type === 'error') {
    const isLoadError = !workerReady;
    showError(msg.message || 'An unexpected error occurred.', isLoadError);
    if (generating) {
      generating = false;
      elGenerateBtn.textContent = 'Tailor My Application';
      elGenerateBtn.classList.remove('generating');
      updateGenerateButton();
    }
  }
}

function handleToken(text) {
  if (!text) return;
  accumulatedText += text;

  if (!separatorFound) {
    const idx = accumulatedText.indexOf(SEPARATOR);
    if (idx !== -1) {
      separatorFound = true;
      separatorIndex = idx;
      elResumePre.textContent = accumulatedText.slice(0, idx).replace(/^\s+/, '');
      const afterSep = accumulatedText.slice(idx + SEPARATOR.length).replace(/^\s+/, '');
      if (afterSep.length > 0) {
        elCoverPre.textContent = afterSep;
      }
    } else {
      elResumePre.textContent = accumulatedText;
    }
  } else {
    elCoverPre.textContent = accumulatedText.slice(separatorIndex + SEPARATOR.length).replace(/^\s+/, '');
  }
}

function enableOutputButtons() {
  elResumeCopy.disabled = false;
  elResumeDownload.disabled = false;
  elCoverCopy.disabled = false;
  elCoverDownload.disabled = false;
}

function disableOutputButtons() {
  elResumeCopy.disabled = true;
  elResumeDownload.disabled = true;
  elCoverCopy.disabled = true;
  elCoverDownload.disabled = true;
}

function initWorker() {
  worker = new Worker('./worker.js', { type: 'module' });

  worker.onerror = (e) => {
    const msg = e.message
      ? `Worker error: ${e.message} (${e.filename}:${e.lineno})`
      : 'Worker failed to load. Ensure transformers.min.js exists in the project root and is being served correctly.';
    showError(msg, true);
  };

  worker.onmessage = handleWorkerMessage;
  worker.postMessage({ type: 'load' });
}

function retryWorker() {
  hideError();
  workerReady = false;
  updateGenerateButton();
  elProgressArea.hidden = false;
  elProgressBarFill.style.width = '0%';
  elProgressLabel.textContent = 'Loading AI model to your browser (first time only, ~400MB)';
  elProgressStatus.textContent = '';
  elReadyIndicator.style.display = 'none';
  elProgressArea.classList.remove('fade-out');

  if (worker) {
    worker.terminate();
    worker = null;
  }
  initWorker();
}

function setupMockMode() {
  elMockBanner.hidden = false;

  setTimeout(() => {
    handleWorkerMessage({ data: { type: 'ready' } });
  }, 1500);

  elGenerateBtn.addEventListener('click', () => {
    if (!elResumeTextarea.value.trim() || !elJdTextarea.value.trim()) return;
    startGeneration();

    setTimeout(() => {
      handleWorkerMessage({ data: { type: 'token', text: '[MOCK] Resume rewriting is not available in test mode.' } });
      setTimeout(() => {
        handleWorkerMessage({ data: { type: 'done' } });
      }, 200);
    }, 1000);
  });
}

function startGeneration() {
  generating = true;
  separatorFound = false;
  separatorIndex = -1;
  accumulatedText = '';
  elResumePre.textContent = '';
  elCoverPre.textContent = '';
  disableOutputButtons();
  elOutputArea.hidden = false;
  elOutputArea.classList.add('visible');
  elGenerateBtn.disabled = true;
  elGenerateBtn.textContent = 'Generating...';
  elGenerateBtn.classList.add('generating');
  hideError();
}

elGenerateBtn.addEventListener('click', () => {
  if (MOCK_MODE) return;
  if (!workerReady || generating) return;

  const resumeText = elResumeTextarea.value.trim();
  const jdText = elJdTextarea.value.trim();
  if (!resumeText || !jdText) return;

  startGeneration();

  worker.postMessage({
    type: 'generate',
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: 'SOURCE RESUME:\n' + resumeText + '\n\nJOB DESCRIPTION:\n' + jdText,
  });
});

elSaveBtn.addEventListener('click', () => {
  try {
    localStorage.setItem(LS_RESUME_KEY, elResumeTextarea.value);
    const orig = elSaveBtn.textContent;
    elSaveBtn.textContent = 'Saved';
    setTimeout(() => { elSaveBtn.textContent = orig; }, 2000);
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      showError('Storage quota exceeded. Unable to save resume. Try clearing browser storage.', false);
    } else {
      showError('Failed to save resume: ' + (err.message || String(err)), false);
    }
  }
});

elClearBtn.addEventListener('click', () => {
  if (!window.confirm('Clear your saved resume? This cannot be undone.')) return;
  elResumeTextarea.value = '';
  try {
    localStorage.removeItem(LS_RESUME_KEY);
  } catch (_) {}
  updateGenerateButton();
});

elUploadBtn.addEventListener('click', () => {
  elFileInput.click();
});

elFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  elFileInput.value = '';

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str);
      fullText += strings.join(' ') + '\n';
    }

    elResumeTextarea.value = fullText.trim();
    updateGenerateButton();
  } catch (err) {
    showError(
      'Failed to extract text from PDF. Try pasting your resume text manually. (' +
        (err.message || String(err)) +
        ')',
      false
    );
  }
});

elResumeTextarea.addEventListener('input', updateGenerateButton);
elJdTextarea.addEventListener('input', updateGenerateButton);

elErrorDismiss.addEventListener('click', hideError);
elErrorRetry.addEventListener('click', retryWorker);

elResumeCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(elResumePre.textContent).then(() => {
    const orig = elResumeCopy.textContent;
    elResumeCopy.textContent = 'Copied!';
    setTimeout(() => { elResumeCopy.textContent = orig; }, 1500);
  });
});

elCoverCopy.addEventListener('click', () => {
  navigator.clipboard.writeText(elCoverPre.textContent).then(() => {
    const orig = elCoverCopy.textContent;
    elCoverCopy.textContent = 'Copied!';
    setTimeout(() => { elCoverCopy.textContent = orig; }, 1500);
  });
});

elResumeDownload.addEventListener('click', () => {
  const blob = new Blob([elResumePre.textContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tailored-resume.txt';
  a.click();
  URL.revokeObjectURL(url);
});

elCoverDownload.addEventListener('click', () => {
  const blob = new Blob([elCoverPre.textContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cover-letter.txt';
  a.click();
  URL.revokeObjectURL(url);
});

elHamburger.addEventListener('click', () => {
  elSidebar.classList.toggle('open');
});

function init() {
  const saved = localStorage.getItem(LS_RESUME_KEY);
  if (saved) {
    elResumeTextarea.value = saved;
  }

  updateGenerateButton();

  if (!localStorage.getItem(LS_NOTICE_KEY)) {
    elNoticeBanner.hidden = false;
  }

  elNoticeDismiss.addEventListener('click', () => {
    elNoticeBanner.hidden = true;
    try {
      localStorage.setItem(LS_NOTICE_KEY, '1');
    } catch (_) {}
  });

  elProgressArea.hidden = false;

  if (MOCK_MODE) {
    setupMockMode();
  } else {
    initWorker();
  }
}

init();
