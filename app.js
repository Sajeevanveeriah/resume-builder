const LS_RESUME_KEY = 'resume_text';
const SESSION_KEY = 'groq_key';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const CHAR_SOFT_LIMIT = 4000;

const RESUME_SYSTEM_PROMPT = `You are an expert resume writer specialising in Australian engineering job applications. You will receive a candidate's existing resume and a job description. Rewrite the resume to be ATS-optimised for that specific role.

Rules:
- Preserve all factual content exactly. Do not invent experience, qualifications, dates, company names, or metrics not present in the original resume.
- Reorder and reword content to maximise keyword alignment with the job description.
- Use strong past-tense action verbs for all bullet points.
- Output plain text only. No markdown. No asterisks. No hyphens used as decorators. Use the bullet character • for all bullet points.
- Section order: name and contact block, blank line, PROFESSIONAL SUMMARY, blank line, KEY SKILLS, blank line, WORK EXPERIENCE, blank line, EDUCATION, blank line, CERTIFICATIONS (omit if none in original), blank line, REFEREES.
- KEY SKILLS: output as comma-separated values on one or two lines, not as bullet points.
- REFEREES: always output exactly "Available upon request."
- If the job description is for a specific industry (e.g. mining, healthcare, defence), retain all transferable terminology from the candidate's background and surface relevant parallels.
- Do not pad the resume with empty sections. If a section has no content in the original (e.g. Certifications), omit it entirely.
- Ensure the Professional Summary is 3–4 sentences, specific to the role, and names the target role title.
- Do not truncate. Output the complete resume.
- Do not add any commentary, preamble, or closing note. Output the resume text only.`;

const COVER_SYSTEM_PROMPT = `You are an expert cover letter writer for Australian engineering job applications. You will receive a candidate's resume and a job description. Write a professional cover letter in Australian English.

Rules:
- Length: 260 to 320 words for the body paragraphs. Do not exceed 320 words.
- Four paragraphs: (1) opening — state the role and strongest alignment point; (2) two specific achievements from the resume mapped to role requirements — concrete, reference real company names and outcomes; (3) skills and domain fit; (4) closing — availability and contact details.
- Australian English spelling throughout.
- No generic filler. Do not write "I am a hardworking team player", "I am passionate about", "I would love to", or similar.
- Do not use "I am writing to apply for" as an opening. Start with a direct statement of fit.
- If the candidate's visa status or work rights are mentioned in the resume, do not reference it in the cover letter unless the JD explicitly requests it.
- The closing paragraph must name a specific action: "I am available for an interview at your convenience and can be reached on [phone] or [email]." Use the actual contact details from the resume.
- Output plain text only. No markdown. No asterisks.
- Structure: date on first line (format DD Month YYYY using today's actual date), blank line, "Hiring Manager" followed by company name if detectable, blank line, "Re: [Job Title] Position", blank line, four paragraphs each separated by a blank line, blank line, "Yours sincerely,", blank line, candidate's full name, candidate's email and phone on one line.
- Do not add any commentary, preamble, or closing note. Output the cover letter text only.`;

// Common stopwords removed before computing the ATS keyword match score.
const ATS_STOPWORDS = new Set([
  'a','an','the','and','or','to','of','in','for','with','on','at','by','is','are','that',
  'this','be','as','from','it','its','we','you','your','our','their','will','have','has',
  'had','was','were','they','but','not','can','all','any','if','about','into','out','over',
  'under','than','then','also','more','most','some','other','which','who','whom','what',
  'when','where','why','how','these','those','i','me','my','us','them','his','her','do',
  'does','did','being','been','there','here','each','per','via','etc','within','across',
  'while','such','must','should','would','could','may','might','well','able'
]);

document.addEventListener('DOMContentLoaded', () => {
  const elResumeTextarea = document.getElementById('resume-textarea');
  const elResumeCharCount= document.getElementById('resume-char-count');
  const elJdTextarea     = document.getElementById('jd-textarea');
  const elGenerateBtn    = document.getElementById('generate-btn');
  const elGenerateText   = elGenerateBtn.querySelector('.btn-generate-text');
  const elResumeCard     = document.getElementById('resume-card');
  const elCoverCard      = document.getElementById('cover-card');
  const elResumePre      = document.getElementById('resume-output');
  const elCoverPre       = document.getElementById('cover-output');
  const elResumeCopy     = document.getElementById('resume-copy');
  const elCoverCopy      = document.getElementById('cover-copy');
  const elResumeDownload = document.getElementById('resume-download');
  const elCoverDownload  = document.getElementById('cover-download');
  const elResumePdf      = document.getElementById('resume-pdf');
  const elCoverPdf       = document.getElementById('cover-pdf');
  const elErrorArea      = document.getElementById('error-area');
  const elErrorMessage   = document.getElementById('error-message');
  const elErrorDismiss   = document.getElementById('error-dismiss');
  const elSaveBtn        = document.getElementById('save-btn');
  const elClearBtn       = document.getElementById('clear-btn');
  const elUploadBtn      = document.getElementById('upload-btn');
  const elFileInput      = document.getElementById('file-input');
  const elHamburger      = document.getElementById('hamburger-btn');
  const elSidebar        = document.getElementById('sidebar');
  const elSidebarBackdrop= document.getElementById('sidebar-backdrop');
  const elWordCount      = document.getElementById('word-count');
  const elApiKeyInput    = document.getElementById('api-key-input');
  const elApiKeyStatus   = document.getElementById('api-key-status');
  const elStepBar        = document.getElementById('step-bar');
  const elStepResume     = document.getElementById('step-resume');
  const elStepCover      = document.getElementById('step-cover');
  const elAtsBadge       = document.getElementById('ats-badge');

  function updateButtonState() {
    const ok = elResumeTextarea.value.trim().length > 0
            && elJdTextarea.value.trim().length > 0
            && elApiKeyInput.value.trim().length > 0;
    elGenerateBtn.disabled = !ok;
  }

  function updateCharCount() {
    const n = elResumeTextarea.value.length;
    elResumeCharCount.textContent = n + ' / ' + CHAR_SOFT_LIMIT;
    elResumeCharCount.classList.remove('warn', 'over');
    if (n > CHAR_SOFT_LIMIT) elResumeCharCount.classList.add('over');
    else if (n > CHAR_SOFT_LIMIT - 500) elResumeCharCount.classList.add('warn');
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
    elGenerateText.textContent = on ? 'Generating…' : 'Tailor My Application';
    elGenerateBtn.classList.toggle('generating', on);
  }

  function showSkeleton(card, pre) {
    pre.classList.remove('streaming');
    pre.innerHTML = '<div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>';
    card.style.display = 'block';
  }

  // ── Step progress bar ──
  function setStep(step, state) {
    step.classList.remove('active', 'complete', 'error');
    if (state) step.classList.add(state);
  }

  function resetSteps() {
    setStep(elStepResume, '');
    setStep(elStepCover, '');
  }

  // ── Word counts ──
  function countWords(text) {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function setWordCounts(resumeText, coverText) {
    elWordCount.textContent =
      'Resume: ' + countWords(resumeText) + ' words · Cover letter: ' + countWords(coverText) + ' words';
    elWordCount.hidden = false;
  }

  // ── ATS keyword match score ──
  function computeAtsScore(jdText, resumeText) {
    const tokens = jdText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !ATS_STOPWORDS.has(w));
    const keywords = Array.from(new Set(tokens));
    if (keywords.length === 0) return null;
    const resumeLower = resumeText.toLowerCase();
    let matched = 0;
    for (const kw of keywords) {
      if (resumeLower.includes(kw)) matched++;
    }
    return Math.round((matched / keywords.length) * 100);
  }

  function showAtsBadge(score) {
    elAtsBadge.classList.remove('ats-good', 'ats-mid', 'ats-low');
    if (score === null || score === undefined) {
      elAtsBadge.hidden = true;
      return;
    }
    elAtsBadge.textContent = 'ATS Match: ' + score + '%';
    if (score >= 80) elAtsBadge.classList.add('ats-good');
    else if (score >= 60) elAtsBadge.classList.add('ats-mid');
    else elAtsBadge.classList.add('ats-low');
    elAtsBadge.hidden = false;
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ── PDF export via the browser's print dialog + print stylesheet ──
  function exportPdf(bodyClass) {
    document.body.classList.add(bodyClass);
    const cleanup = () => {
      document.body.classList.remove(bodyClass);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    // Fallback in case the afterprint event does not fire.
    setTimeout(cleanup, 1000);
  }

  function setupCopy(btn, pre) {
    const label = btn.querySelector('.btn-label');
    const original = label ? label.textContent : 'Copy';
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(pre.textContent || '').then(() => {
        if (label) label.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          if (label) label.textContent = original;
          btn.classList.remove('copied');
        }, 1200);
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

    try {
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
                outputPre.classList.add('streaming');
                started = true;
              }
              outputPre.textContent += delta;
            }
          } catch (_) {}
        }
      }
    } finally {
      outputPre.classList.remove('streaming');
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
    showAtsBadge(null);
    showStepBar(true);
    resetSteps();
    showSkeleton(elResumeCard, elResumePre);
    showSkeleton(elCoverCard, elCoverPre);
    setGeneratingState(true);

    // Tracks which step is in flight so we can flag it on error.
    let activeStep = elStepResume;

    try {
      setStep(elStepResume, 'active');
      activeStep = elStepResume;
      await streamGroq({
        apiKey,
        systemPrompt: RESUME_SYSTEM_PROMPT,
        userMessage:  'RESUME:\n' + resumeText + '\n\nJOB DESCRIPTION:\n' + jdText + '\n\nProduce the tailored resume now.',
        outputPre:    elResumePre,
        outputCard:   elResumeCard,
      });
      setStep(elStepResume, 'complete');

      setStep(elStepCover, 'active');
      activeStep = elStepCover;
      await streamGroq({
        apiKey,
        systemPrompt: COVER_SYSTEM_PROMPT,
        userMessage:  'RESUME:\n' + resumeText + '\n\nJOB DESCRIPTION:\n' + jdText + '\n\nProduce the cover letter now.',
        outputPre:    elCoverPre,
        outputCard:   elCoverCard,
      });
      setStep(elStepCover, 'complete');

      setWordCounts(elResumePre.textContent, elCoverPre.textContent);
      showAtsBadge(computeAtsScore(jdText, elResumePre.textContent));
    } catch (err) {
      setStep(activeStep, 'error');
      showError(err instanceof TypeError ? 'Network error. Check your internet connection.' : (err.message || 'Unexpected error.'));
    } finally {
      setGeneratingState(false);
      updateButtonState();
      elResumePre.classList.remove('streaming');
      elCoverPre.classList.remove('streaming');
    }
  }

  function showStepBar(show) {
    elStepBar.hidden = !show;
  }

  // ── Mobile sidebar open/close with backdrop ──
  function openSidebar() {
    elSidebar.classList.add('open');
    elHamburger.setAttribute('aria-expanded', 'true');
    elSidebarBackdrop.hidden = false;
    elSidebarBackdrop.classList.add('visible');
  }

  function closeSidebar() {
    elSidebar.classList.remove('open');
    elHamburger.setAttribute('aria-expanded', 'false');
    elSidebarBackdrop.classList.remove('visible');
    elSidebarBackdrop.hidden = true;
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
    updateCharCount();
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
      updateCharCount();
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
  elResumePdf.addEventListener('click', () => exportPdf('printing-resume'));
  elCoverPdf.addEventListener('click',  () => exportPdf('printing-cover'));

  elHamburger.addEventListener('click', () => {
    if (elSidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });
  elSidebarBackdrop.addEventListener('click', closeSidebar);

  elResumeTextarea.addEventListener('input', () => { updateCharCount(); updateButtonState(); });
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
    elStepBar.hidden = true;
    elWordCount.hidden = true;
    showAtsBadge(null);
    updateCharCount();
    updateButtonState();
  })();
});
