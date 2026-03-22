const LS_RESUME_KEY = 'resume_text';
const SESSION_KEY = 'groq_key';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

const RESUME_SYSTEM_PROMPT = `You are an expert resume writer specialising in Australian engineering job applications. You will receive a candidate's existing resume and a job description. Rewrite the resume to be ATS-optimised for that specific role.

Rules:
- Preserve all factual content exactly. Do not invent experience, qualifications, dates, company names, or metrics not present in the original resume.
- Reorder and reword content to maximise keyword alignment with the job description.
- Use strong past-tense action verbs for all bullet points.
- Output plain text only. No markdown. No asterisks. No hyphens used as decorators. Use the bullet character • for all bullet points.
- Section order: name and contact block, blank line, PROFESSIONAL SUMMARY, blank line, KEY SKILLS, blank line, WORK EXPERIENCE, blank line, EDUCATION, blank line, CERTIFICATIONS (omit if none in original), blank line, REFEREES.
- KEY SKILLS: output as comma-separated values on one or two lines, not as bullet points.
- REFEREES: always output exactly "Available upon request."
- Do not truncate. Output the complete resume.
- Do not add any commentary, preamble, or closing note. Output the resume text only.`;

const COVER_SYSTEM_PROMPT = `You are an expert cover letter writer for Australian engineering job applications. You will receive a candidate's resume and a job description. Write a professional cover letter in Australian English.

Rules:
- Length: 260 to 320 words for the body paragraphs. Do not exceed 320 words.
- Four paragraphs: (1) opening — state the role and strongest alignment point; (2) two specific achievements from the resume mapped to role requirements — concrete, reference real company names and outcomes; (3) skills and domain fit; (4) closing — availability and contact details.
- Australian English spelling throughout.
- No generic filler. Do not write "I am a hardworking team player", "I am passionate about", "I would love to", or similar.
- Output plain text only. No markdown. No asterisks.
- Structure: date on first line (format DD Month YYYY using today's actual date), blank line, "Hiring Manager" followed by company name if detectable, blank line, "Re: [Job Title] Position", blank line, four paragraphs each separated by a blank line, blank line, "Yours sincerely,", blank line, candidate's full name, candidate's email and phone on one line.
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
  const elApiKeyInput    = document.getElementById('api-key-input');
  const elApiKeyStatus   = document.getElementById('api-key-status');

  const copyFeedbackMap = new Map([[elResumeCopy, 'Copy'], [elCoverCopy, 'Copy']]);

  function updateButtonState() {
    const ok = elResumeTextarea.value.trim().length > 0
            && elJdTextarea.value.trim().length > 0
            && elApiKeyInput.value.trim().length > 0;
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
    elWordCount.textContent = 'Word count: ' + n;
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
        const r = document.createRange();
        r.selectNodeContents(pre);
        sel.removeAllRanges(); sel.addRange(r);
      });
    });
  }

  async function streamGroq({ apiKey, systemPrompt, userMessage, outputPre, outputCard }) {
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  },
        ],
        max_tokens: 2048,
        temperature: 0.4,
        stream: true,
      }),
    });

    if (!response.ok) {
      let msg = 'Groq API error.';
      if (response.status === 401) msg = 'Invalid API key. Check the key in the sidebar.';
      if (response.status === 429) msg = 'Rate limit reached. Wait 60 seconds and try again.';
      if (response.status === 500 || response.status === 503) msg = 'Groq service error. Try again in a moment.';
      try {
        const p = await response.json();
        if (p && p.error && p.error.message) msg += ' ' + p.error.message;
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
          const delta  = parsed && parsed.choices && parsed.choices[0] &&
                         parsed.choices[0].delta && parsed.choices[0].delta.content;
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

  async function processApplication() {
    const resumeText = elResumeTextarea.value.trim();
    const jdText     = elJdTextarea.value.trim();
    const apiKey     = elApiKeyInput.value.trim();

    if (!apiKey)     { showError('Paste your Groq API key in the sidebar first.'); return; }
    if (!resumeText) { showError('Paste your resume in the sidebar first.'); return; }
    if (!jdText)     { showError('Paste the job description first.'); return; }

    hideError();
    elWordCount.hidden = true;
    showSkeleton(elResumeCard, elResumePre);
    showSkeleton(elCoverCard, elCoverPre);
    setGeneratingState(true);

    try {
      await streamGroq({
        apiKey,
        systemPrompt: RESUME_SYSTEM_PROMPT,
        userMessage:  'RESUME:\n' + resumeText + '\n\nJOB DESCRIPTION:\n' + jdText + '\n\nProduce the tailored resume now.',
        outputPre:    elResumePre,
        outputCard:   elResumeCard,
      });
      await streamGroq({
        apiKey,
        systemPrompt: COVER_SYSTEM_PROMPT,
        userMessage:  'RESUME:\n' + resumeText + '\n\nJOB DESCRIPTION:\n' + jdText + '\n\nProduce the cover letter now.',
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

  elGenerateBtn.addEventListener('click', processApplication);

  elApiKeyInput.addEventListener('input', () => {
    const key = elApiKeyInput.value.trim();
    if (key) {
      sessionStorage.setItem(SESSION_KEY, key);
      elApiKeyStatus.textContent = 'Key entered';
      elApiKeyStatus.style.color = '#16a34a';
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      elApiKeyStatus.textContent = '';
    }
    updateButtonState();
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
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(content.items.map(function(item) { return item.str; }).join(' '));
      }
      elResumeTextarea.value = pages.join('\n').trim();
      updateButtonState();
    } catch (err) {
      showError('Failed to read PDF. ' + (err.message || ''));
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
  elJdTextarea.addEventListener('input', updateButtonState);

  (function init() {
    const saved = localStorage.getItem(LS_RESUME_KEY);
    if (saved) elResumeTextarea.value = saved;
    const savedKey = sessionStorage.getItem(SESSION_KEY);
    if (savedKey) {
      elApiKeyInput.value = savedKey;
      elApiKeyStatus.textContent = 'Key entered';
      elApiKeyStatus.style.color = '#16a34a';
    }
    hideError();
    elResumeCard.style.display = 'none';
    elCoverCard.style.display  = 'none';
    elWordCount.hidden = true;
    updateButtonState();
  })();
});
