const LS_RESUME_KEY = 'resume_text';
const SESSION_GEMINI_KEY = 'gemini_key';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=';

const RESUME_SYSTEM_PROMPT = `You are an expert resume writer specialising in Australian engineering job applications. You will receive a candidate's existing resume and a job description. Rewrite the resume to be ATS-optimised for that specific role.

Rules:
- Preserve all factual content exactly. Do not invent experience, qualifications, dates, company names, or metrics that are not present in the original resume.
- Reorder and reword content to maximise keyword alignment with the job description.
- Use strong past-tense action verbs for all bullet points.
- Output plain text only. No markdown. No asterisks. No hyphens used as decorators. Use the bullet character • for all bullet points.
- Section order: name and contact block, blank line, PROFESSIONAL SUMMARY, blank line, KEY SKILLS, blank line, WORK EXPERIENCE, blank line, EDUCATION, blank line, CERTIFICATIONS (omit section entirely if none in original), blank line, REFEREES.
- KEY SKILLS: output as comma-separated values on one or two lines, not as bullet points.
- REFEREES: always output exactly "Available upon request."
- Do not truncate. Output the complete resume.
- Do not add any commentary, preamble, or closing note. Output the resume text only.`;

const COVER_SYSTEM_PROMPT = `You are an expert cover letter writer for Australian engineering job applications. You will receive a candidate's resume and a job description. Write a professional cover letter in Australian English.

Rules:
- Length: 260 to 320 words for the body paragraphs. Do not exceed 320 words.
- Four paragraphs: (1) opening — state the role being applied for and the single strongest alignment point; (2) two specific achievements drawn directly from the resume that map to the role requirements — be concrete, reference real company names and outcomes from the resume; (3) skills and domain fit — connect the candidate's technical skills to what the role requires; (4) closing — express availability for interview and provide contact details.
- Australian English spelling throughout.
- No generic filler phrases. Do not write "I am a hardworking team player", "I am passionate about", "I would love to", or similar.
- Output plain text only. No markdown. No asterisks.
- Structure: date on first line (format DD Month YYYY using today's actual date), blank line, "Hiring Manager" followed by the company name if detectable from the job description, blank line, "Re: [Job Title] Position", blank line, four body paragraphs each separated by a blank line, blank line, "Yours sincerely,", blank line, candidate's full name, candidate's email and phone on one line separated by a space.
- Do not add any commentary, preamble, or closing note. Output the cover letter text only.`;

document.addEventListener('DOMContentLoaded', () => {
  const elResumeTextarea = document.getElementById('resume-textarea');
  const elJdTextarea     = document.getElementById('jd-textarea');
  const elGenerateBtn    = document.getElementById('generate-btn');
  const elResumeCard     = document.getElementById('resume-card');
  const elCoverCard      = document.getElementById('cover-card');
  const elResumePre      = document.getElementById('resume-output');
  const elCoverPre       = document.getElementById('cover-output');
  const elResumeCopy     = document.getElementById('resume-copy');
  const elCoverCopy      = document.getElementById('cover-copy');
  const elResumeDownload = document.getElementById('resume-download');
  const elCoverDownload  = document.getElementById('cover-download');
  const elErrorArea      = document.getElementById('error-area');
  const elErrorMessage   = document.getElementById('error-message');
  const elErrorDismiss   = document.getElementById('error-dismiss');
  const elSaveBtn        = document.getElementById('save-btn');
  const elClearBtn       = document.getElementById('clear-btn');
  const elUploadBtn      = document.getElementById('upload-btn');
  const elFileInput      = document.getElementById('file-input');
  const elHamburger      = document.getElementById('hamburger-btn');
  const elSidebar        = document.getElementById('sidebar');
  const elWordCount      = document.getElementById('word-count');
  const elModal          = document.getElementById('key-modal');
  const elKeyInput       = document.getElementById('key-input');
  const elSaveKeyBtn     = document.getElementById('save-key-btn');
  const elModalCloseBtn  = document.getElementById('modal-close-btn');
  const elChangeKeyLink  = document.getElementById('change-key-link');

  const copyFeedbackMap = new Map([
    [elResumeCopy, 'Copy'],
    [elCoverCopy,  'Copy'],
  ]);

  const STATUS_MESSAGES = {
    400: 'Bad request. Check your resume and job description contain readable text.',
    403: "API key rejected. Click 'Change API key' to re-enter.",
    429: 'Rate limit reached (free tier: 15 requests/minute). Wait 60 seconds and try again.',
    500: 'Gemini service error. Try again in a moment.',
    503: 'Gemini service error. Try again in a moment.',
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  function updateButtonState() {
    const ok = elResumeTextarea.value.trim().length > 0 && elJdTextarea.value.trim().length > 0;
    elGenerateBtn.disabled = !ok;
  }

  function showError(msg) {
    elErrorMessage.textContent = msg;
    elErrorArea.hidden = false;
  }

  function hideError() {
    elErrorMessage.textContent = '';
    elErrorArea.hidden = true;
  }

  function showKeyModal() {
    elKeyInput.value = '';
    elModal.hidden = false;
    setTimeout(() => elKeyInput.focus(), 50);
  }

  function hideKeyModal() {
    elModal.hidden = true;
  }

  function setGeneratingState(on) {
    elGenerateBtn.disabled = on;
    elGenerateBtn.textContent = on ? 'Generating…' : 'Tailor My Application';
    elGenerateBtn.classList.toggle('generating', on);
  }

  function showSkeleton(card, pre) {
    pre.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>';
    card.style.display = 'block';
  }

  function setWordCount(text) {
    const n = text.trim() ? text.trim().split(/\s+/).length : 0;
    elWordCount.textContent = `Word count: ${n}`;
    elWordCount.hidden = false;
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function setupCopy(btn, pre) {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(pre.textContent || '').then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = copyFeedbackMap.get(btn) || 'Copy'; }, 1200);
      }).catch(() => {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(pre);
        sel.removeAllRanges(); sel.addRange(range);
        btn.textContent = 'Select + Ctrl/Cmd+C';
        setTimeout(() => { btn.textContent = copyFeedbackMap.get(btn) || 'Copy'; }, 1400);
      });
    });
  }

  // ── Gemini streaming ─────────────────────────────────────────────────────

  async function streamGemini({ apiKey, systemPrompt, userMessage, outputPre, outputCard }) {
    const response = await fetch(`${GEMINI_ENDPOINT}${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
      }),
    });

    if (!response.ok) {
      let msg = STATUS_MESSAGES[response.status] || 'Unexpected error from Gemini API.';
      try {
        const payload = await response.json();
        if (payload?.error?.message) msg += ' ' + payload.error.message;
      } catch (_) {}
      throw new Error(msg);
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let started = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const json = line.slice(5).trim();
        if (!json || json === '[DONE]') continue;
        try {
          const parsed = JSON.parse(json);
          const delta  = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (delta) {
            if (!started) {
              outputPre.textContent = '';
              outputCard.style.display = 'block';
              started = true;
            }
            outputPre.textContent += delta;
          }
        } catch (_) {}
      }
    }
  }

  // ── Core flow ────────────────────────────────────────────────────────────

  async function processApplication(resumeText, jdText) {
    const apiKey = sessionStorage.getItem(SESSION_GEMINI_KEY);
    if (!apiKey) { showKeyModal(); return; }

    hideError();
    elWordCount.hidden = true;
    showSkeleton(elResumeCard, elResumePre);
    showSkeleton(elCoverCard, elCoverPre);
    setGeneratingState(true);

    try {
      await streamGemini({
        apiKey,
        systemPrompt: RESUME_SYSTEM_PROMPT,
        userMessage:  `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jdText}\n\nProduce the tailored resume now.`,
        outputPre:    elResumePre,
        outputCard:   elResumeCard,
      });

      await streamGemini({
        apiKey,
        systemPrompt: COVER_SYSTEM_PROMPT,
        userMessage:  `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jdText}\n\nProduce the cover letter now.`,
        outputPre:    elCoverPre,
        outputCard:   elCoverCard,
      });

      setWordCount(elCoverPre.textContent);
    } catch (err) {
      showError(err instanceof TypeError ? 'Network error. Check your internet connection.' : (err.message || 'Unexpected error.'));
    } finally {
      setGeneratingState(false);
      updateButtonState();
    }
  }

  // ── Event listeners ──────────────────────────────────────────────────────

  elGenerateBtn.addEventListener('click', async () => {
    const apiKey = sessionStorage.getItem(SESSION_GEMINI_KEY);
    if (!apiKey) { showKeyModal(); return; }
    await processApplication(elResumeTextarea.value.trim(), elJdTextarea.value.trim());
  });

  // Modal: X button closes it
  elModalCloseBtn.addEventListener('click', hideKeyModal);

  // Modal: clicking the dark backdrop closes it
  elModal.addEventListener('click', (e) => {
    if (e.target === elModal) hideKeyModal();
  });

  // Modal: save key then immediately start generation
  elSaveKeyBtn.addEventListener('click', () => {
    const key = elKeyInput.value.trim();
    if (!key) return;
    sessionStorage.setItem(SESSION_GEMINI_KEY, key);
    hideKeyModal();
    updateButtonState();
    const resumeText = elResumeTextarea.value.trim();
    const jdText     = elJdTextarea.value.trim();
    if (resumeText && jdText) processApplication(resumeText, jdText);
  });

  // Modal: Enter key submits
  elKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') elSaveKeyBtn.click();
  });

  elChangeKeyLink.addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.removeItem(SESSION_GEMINI_KEY);
    showKeyModal();
  });

  elSaveBtn.addEventListener('click', () => {
    try {
      localStorage.setItem(LS_RESUME_KEY, elResumeTextarea.value);
      const orig = elSaveBtn.textContent;
      elSaveBtn.textContent = 'Saved';
      setTimeout(() => { elSaveBtn.textContent = orig; }, 900);
    } catch (err) {
      showError(err.name === 'QuotaExceededError' ? 'Storage quota exceeded.' : (err.message || 'Unable to save.'));
    }
  });

  elClearBtn.addEventListener('click', () => {
    if (!window.confirm('Clear your saved resume? This cannot be undone.')) return;
    elResumeTextarea.value = '';
    localStorage.removeItem(LS_RESUME_KEY);
    updateButtonState();
  });

  elUploadBtn.addEventListener('click', () => elFileInput.click());

  elFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    elFileInput.value = '';
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf   = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page    = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => item.str).join(' '));
      }
      elResumeTextarea.value = pages.join('\n').trim();
      updateButtonState();
    } catch (err) {
      showError(`Failed to read PDF. ${err.message || ''}`.trim());
    }
  });

  elErrorDismiss.addEventListener('click', hideError);

  setupCopy(elResumeCopy, elResumePre);
  setupCopy(elCoverCopy,  elCoverPre);

  elResumeDownload.addEventListener('click', () => downloadText(elResumePre.textContent, 'tailored-resume.txt'));
  elCoverDownload.addEventListener('click',  () => downloadText(elCoverPre.textContent,  'cover-letter.txt'));

  elHamburger.addEventListener('click', () => {
    const open = elSidebar.classList.toggle('open');
    elHamburger.setAttribute('aria-expanded', String(open));
  });

  elResumeTextarea.addEventListener('input', updateButtonState);
  elJdTextarea.addEventListener('input',     updateButtonState);

  // ── Init ─────────────────────────────────────────────────────────────────

  (function init() {
    const saved = localStorage.getItem(LS_RESUME_KEY);
    if (saved) elResumeTextarea.value = saved;
    hideError();
    elResumeCard.style.display = 'none';
    elCoverCard.style.display  = 'none';
    elWordCount.hidden = true;
    updateButtonState();
  })();
});
