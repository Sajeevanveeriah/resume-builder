// ─── Constants ────────────────────────────────────────────────────────────────

const LS_RESUME_KEY = 'resume_text';

const STOPWORDS = new Set([
  'a','an','the','and','or','to','of','in','for','with','is','are','be',
  'will','you','we','our','your','this','that','have','has','can','may',
  'must','should','at','on','by','as','it','its','from','not','but','if',
  'do','did','been','were','was','had','all','they','their','who','which',
  'what','how','when','where','why','about','into','through','up','out',
  'more','also','than','so','such','both','each','any','some','new','no',
  'other','one','two','three','within','across','over','while','just',
  'very','well','would','could','am','i','he','she','them','us','me','my',
  'his','her','work','team','role','ability','strong','good','great',
  'experience','skills','background','knowledge','understanding','use',
  'using','used','based','key','high','level','ensure','provide','support',
  'including','required','preferred','bonus','etc','eg','ie','per','day',
  'following','able','please','apply','join','opportunity','want','need',
  'come','make','take','get','give','see','look','keep','let','put',
  'set','run','help','start','end','go','same','different','own','still',
  'however','therefore','thus','hence','further','then','again','now',
  'only','even','most','many','next','last','first','second','third',
]);

const ACTION_VERBS = [
  'Delivered','Developed','Implemented','Managed','Led','Designed',
  'Optimised','Reduced','Increased','Automated','Coordinated','Achieved',
  'Built','Established','Maintained','Improved','Analysed','Configured',
  'Deployed','Supported',
];

const SECTION_PATTERNS = {
  summary: /^(summary|professional\s+summary|profile|about\s*me?|career\s+(objective|summary|profile)|executive\s+summary|personal\s+statement|statement|overview)$/i,
  skills: /^((key\s+|technical\s+|core\s+|professional\s+)?skills?|competenc(y|ies)|technologies|expertise|areas?\s+of\s+expertise|technical\s+proficienc(y|ies)|skill\s*set|tooling)$/i,
  experience: /^((work\s+|professional\s+|employment\s+|career\s+)?(experience|history)|employment|positions?\s+held)$/i,
  education: /^(education(al\s+(background|history|qualifications))?|qualifications?|academic(\s+(background|history|qualifications))?)$/i,
  certifications: /^(certifications?|certificates?|licen[sc]es?|credentials?|accreditations?|professional\s+development|courses?)$/i,
};

// ─── Keyword Extraction ───────────────────────────────────────────────────────

function extractKeywords(jdText) {
  const lower = jdText.toLowerCase();
  const rawWords = lower.split(/\s+/);
  const cleaned = rawWords.map(w => w.replace(/[^a-z0-9]/g, ''));

  const significant = cleaned.filter(w => w.length > 2 && !STOPWORDS.has(w));

  const wordFreq = {};
  significant.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });

  const phraseFreq = {};
  const tokenList = cleaned.filter(w => w.length > 0);
  for (let i = 0; i < tokenList.length - 1; i++) {
    const a = tokenList[i], b = tokenList[i + 1];
    if (a.length > 2 && b.length > 2 && !STOPWORDS.has(a) && !STOPWORDS.has(b)) {
      const p2 = a + ' ' + b;
      phraseFreq[p2] = (phraseFreq[p2] || 0) + 1;
    }
    if (i < tokenList.length - 2) {
      const c = tokenList[i + 2];
      if (a.length > 2 && c.length > 2 && !STOPWORDS.has(a) && !STOPWORDS.has(c)) {
        const p3 = a + ' ' + tokenList[i + 1] + ' ' + c;
        phraseFreq[p3] = (phraseFreq[p3] || 0) + 1;
      }
    }
  }

  const topKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word]) => word);

  const topPhrases = Object.entries(phraseFreq)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);

  const jobTitle = extractJobTitle(jdText);
  const companyName = extractCompanyName(jdText);

  return { keywords: topKeywords, phrases: topPhrases, jobTitle, companyName };
}

function extractJobTitle(jdText) {
  const patterns = [
    /(?:position|role|title|job\s+title)\s*[:\-]\s*([A-Z][^\n,\.]{3,55})/i,
    /(?:looking\s+for|seeking|hiring|recruiting)[^\n]{0,30}?(?:a|an)\s+([A-Z][a-zA-Z\s\/\-]{3,45})/i,
    /^([A-Z][a-zA-Z\/\s\-]{5,50})\s*\n/m,
  ];
  for (const re of patterns) {
    const m = jdText.match(re);
    if (m && m[1]) return m[1].trim().replace(/[,\.;:!?]+$/, '');
  }
  const first = jdText.split('\n').map(l => l.trim()).find(l => l.length > 3 && l.length < 80);
  return first ? first.replace(/[,\.;:!?]+$/, '') : '';
}

function extractCompanyName(jdText) {
  const patterns = [
    /([A-Z][a-zA-Z\s&\.,]{1,45}?)\s+is\s+(?:looking|seeking|hiring|a\s+leading|an?\s+)/,
    /(?:at|join|with)\s+([A-Z][a-zA-Z\s&\.,]{1,45}?)(?:\s+is|\s+are|\s+we|\s+an?\b|[,\.\n])/,
    /(?:company|employer|organisation|organization)\s*[:\-]\s*([A-Z][^\n,\.]{2,45})/i,
  ];
  for (const re of patterns) {
    const m = jdText.match(re);
    if (m && m[1]) {
      const name = m[1].trim().replace(/[,\.;]+$/, '');
      if (name.split(/\s+/).length <= 7 && !STOPWORDS.has(name.toLowerCase())) return name;
    }
  }
  return '';
}

// ─── Resume Parsing ───────────────────────────────────────────────────────────

function parseResume(resumeText) {
  const lines = resumeText.split('\n');
  const full = resumeText;

  const emailM = full.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  const email = emailM ? emailM[0] : '';

  const phoneM = full.match(/(?:\+?[\d][\d\s\-\(\)\.]{6,}[\d])/);
  const phone = phoneM ? phoneM[0].trim() : '';

  const linkedinM = full.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w\-]+\/?/i);
  const linkedin = linkedinM ? linkedinM[0] : '';

  const sections = { header: [], summary: [], skills: [], experience: [], education: [], certifications: [] };
  let currentKey = 'header';

  for (const line of lines) {
    const stripped = line.trim().replace(/:$/, '').trim();
    let found = null;

    if (stripped.length > 0 && stripped.length < 65) {
      for (const [key, re] of Object.entries(SECTION_PATTERNS)) {
        if (re.test(stripped)) { found = key; break; }
      }
      if (!found && stripped === stripped.toUpperCase() && stripped.length >= 4 && /[A-Z]/.test(stripped)) {
        const lower = stripped.toLowerCase();
        for (const [key, re] of Object.entries(SECTION_PATTERNS)) {
          if (re.test(lower)) { found = key; break; }
        }
      }
    }

    if (found) {
      currentKey = found;
    } else {
      sections[currentKey].push(line);
    }
  }

  let name = '';
  for (const line of sections.header) {
    const t = line.trim();
    if (!t || t.includes('@') || t.includes('linkedin.com')) continue;
    if (/^\+?[\d\s\-\(\)\.]{7,}$/.test(t)) continue;
    if (t.length < 2 || t.length > 65) continue;
    name = t;
    break;
  }

  let location = '';
  const topText = lines.slice(0, 15).join('\n');
  const locM = topText.match(/([A-Z][a-z]+(?: [A-Z][a-z]+)*),?\s*(?:[A-Z]{2,3}|NSW|VIC|QLD|WA|SA|TAS|ACT|NT|Victoria|Queensland|New South Wales|Western Australia|South Australia|Tasmania)/);
  if (locM) location = locM[0];

  const summary = sections.summary.filter(l => l.trim()).join(' ').trim();

  const skills = [];
  sections.skills.filter(l => l.trim()).forEach(line => {
    line.split(/[,|•·\-;]+/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50).forEach(s => skills.push(s));
  });

  const experience = parseExperienceSection(sections.experience);
  const education = parseEducationSection(sections.education);
  const certifications = sections.certifications.filter(l => l.trim()).map(l => l.replace(/^[•·\-\*]\s*/, '').trim());

  return { name, email, phone, linkedin, location, summary, skills, experience, education, certifications };
}

function parseExperienceSection(lines) {
  const DATE_RE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|\d{4}|present|current)\b/i;
  const BULLET_RE = /^[\s]*[•·\-\*▪◦‣>]\s*(.+)/;
  const entries = [];
  let cur = null;

  const push = () => { if (cur) entries.push(cur); };
  const blank = () => ({ title: '', company: '', location: '', dates: '', bullets: [] });

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    const bulletM = t.match(BULLET_RE);
    if (bulletM) {
      if (!cur) cur = blank();
      cur.bullets.push(bulletM[1].trim());
      continue;
    }

    const hasDate = DATE_RE.test(t);
    const hasPipe = t.includes('|');

    if ((hasDate || hasPipe) && t.length < 220) {
      if (cur && !cur.company && !cur.dates && cur.bullets.length === 0) {
        if (hasPipe) {
          const parts = t.split('|').map(p => p.trim());
          cur.company = parts[0] || '';
          for (const p of parts.slice(1)) {
            if (DATE_RE.test(p)) cur.dates = p;
            else if (!cur.location) cur.location = p;
          }
        } else {
          const m = t.match(/^(.+?)\s*[|,–—\-]\s*(.+)$/);
          if (m && DATE_RE.test(m[2])) {
            cur.company = m[1].trim();
            cur.dates = m[2].trim();
          } else {
            cur.company = t;
          }
        }
      } else {
        push();
        cur = blank();
        if (hasPipe) {
          const parts = t.split('|').map(p => p.trim());
          cur.title = parts[0] || '';
          cur.company = parts[1] || '';
          for (const p of parts.slice(2)) {
            if (DATE_RE.test(p)) cur.dates = p;
            else if (!cur.location) cur.location = p;
          }
        } else {
          const m = t.match(/^(.+?)\s*[,–—\-]\s*(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december|\d{4}).+)$/i);
          if (m) {
            const before = m[1].split(/[,|]/).map(p => p.trim());
            cur.title = before[0] || '';
            cur.company = before[1] || '';
            cur.dates = m[2].trim();
          } else {
            cur.title = t;
          }
        }
      }
    } else if (cur) {
      if (!cur.company && t.length < 80) {
        cur.company = t;
      } else {
        cur.bullets.push(t);
      }
    } else {
      cur = blank();
      cur.title = t;
    }
  }
  push();
  return entries;
}

function parseEducationSection(lines) {
  const YEAR_RE = /\b((?:19|20)\d{2})\b/;
  const entries = [];
  let cur = null;

  for (const line of lines) {
    const t = line.trim().replace(/^[•·\-\*]\s*/, '');
    if (!t) continue;

    const hasYear = YEAR_RE.test(t);
    const hasPipe = t.includes('|');

    if (hasYear || hasPipe) {
      if (cur) entries.push(cur);
      if (hasPipe) {
        const parts = t.split('|').map(p => p.trim());
        const yearM = t.match(YEAR_RE);
        cur = { degree: parts[0] || '', institution: parts[1] || '', year: yearM ? yearM[0] : (parts[2] || '') };
      } else {
        const m = t.match(/^(.+?)[,\s]+(\b(?:19|20)\d{2}\b.*)$/);
        if (m) {
          const before = m[1].split(/[,|]/).map(p => p.trim());
          cur = { degree: before[0] || '', institution: before[1] || '', year: m[2].trim() };
        } else {
          cur = { degree: t, institution: '', year: '' };
        }
      }
    } else if (cur) {
      if (!cur.institution) cur.institution = t;
    } else {
      cur = { degree: t, institution: '', year: '' };
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

// ─── Resume Builder ───────────────────────────────────────────────────────────

function buildResume(parsed, kwResult, resumeText) {
  const { keywords } = kwResult;
  const out = [];

  out.push(parsed.name || 'Your Name');
  const contact = [parsed.email, parsed.phone, parsed.location].filter(Boolean).join(' | ');
  if (contact) out.push(contact);
  if (parsed.linkedin) out.push(parsed.linkedin);
  out.push('');

  out.push('PROFESSIONAL SUMMARY');
  out.push(buildSummary(parsed, keywords));
  out.push('');

  const skills = buildSkillsList(parsed, keywords, resumeText);
  if (skills.length > 0) {
    out.push('KEY SKILLS');
    for (let i = 0; i < skills.length; i += 6) {
      out.push(skills.slice(i, i + 6).join(', '));
    }
    out.push('');
  }

  if (parsed.experience.length > 0) {
    out.push('WORK EXPERIENCE');
    parsed.experience.forEach(exp => {
      const header = [exp.title, exp.company, exp.location, exp.dates].filter(Boolean).join(' | ');
      out.push(header);
      exp.bullets.forEach(b => out.push('• ' + rewriteBullet(b)));
      if (exp.bullets.length === 0) out.push('• ' + ACTION_VERBS[0] + ' key responsibilities within the role.');
      out.push('');
    });
  }

  if (parsed.education.length > 0) {
    out.push('EDUCATION');
    parsed.education.forEach(edu => {
      out.push([edu.degree, edu.institution, edu.year].filter(Boolean).join(' | '));
    });
    out.push('');
  }

  if (parsed.certifications.length > 0) {
    out.push('CERTIFICATIONS');
    parsed.certifications.forEach(c => out.push(c));
    out.push('');
  }

  out.push('REFEREES');
  out.push('Available upon request.');

  return out.join('\n');
}

function buildSummary(parsed, keywords) {
  let base = parsed.summary;

  if (!base) {
    const recentTitle = parsed.experience.length > 0 ? parsed.experience[0].title : '';
    const topSkills = parsed.skills.slice(0, 3).join(', ');
    base = recentTitle
      ? `Experienced ${recentTitle} with a proven track record of delivering results across multiple organisations.`
      : 'Skilled professional with extensive experience across a range of roles and environments.';
    if (topSkills) base += ` Proficient in ${topSkills}, with a strong commitment to quality and continuous improvement.`;
  }

  const top5 = keywords.slice(0, 5);
  const baseLower = base.toLowerCase();
  const missing = top5.filter(kw => !baseLower.includes(kw)).slice(0, 3);
  if (missing.length > 0) {
    base = base.trimEnd();
    if (!base.endsWith('.')) base += '.';
    base += ` Demonstrated expertise in ${missing.join(', ')}, consistently delivering high-quality outcomes in dynamic environments.`;
  }

  return base;
}

function buildSkillsList(parsed, keywords, resumeText) {
  const lowerResume = resumeText.toLowerCase();
  const seen = new Set();
  const result = [];

  parsed.skills.forEach(s => {
    const key = s.toLowerCase().trim();
    if (key.length > 1 && !seen.has(key)) { seen.add(key); result.push(s.trim()); }
  });

  keywords.forEach(kw => {
    if (kw.length > 3 && lowerResume.includes(kw) && !seen.has(kw)) {
      seen.add(kw);
      result.push(kw.charAt(0).toUpperCase() + kw.slice(1));
    }
  });

  return result;
}

function rewriteBullet(bullet) {
  const lower = bullet.toLowerCase().trim();
  if (ACTION_VERBS.some(v => lower.startsWith(v.toLowerCase()))) return bullet;

  const stripped = bullet
    .replace(/^(?:responsible\s+for|tasked\s+with|worked\s+on|assisted\s+with|helped\s+with|involved\s+in|duties?\s+included?|acted\s+as|served\s+as|provided)\s+/i, '')
    .trim();

  const verb = ACTION_VERBS[simpleHash(bullet) % ACTION_VERBS.length];
  const rest = stripped.length > 0
    ? stripped.charAt(0).toLowerCase() + stripped.slice(1)
    : stripped;
  return `${verb} ${rest}`;
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── Cover Letter Builder ─────────────────────────────────────────────────────

function buildCoverLetter(parsed, kwResult, jdText) {
  const { keywords, jobTitle, companyName } = kwResult;
  const lowerJd = jdText.toLowerCase();

  const today = new Date();
  const months = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const dateStr = String(today.getDate()).padStart(2, '0') + ' ' + months[today.getMonth()] + ' ' + today.getFullYear();

  const company = companyName || 'your organisation';
  const role = jobTitle || 'this position';

  const skill1 = parsed.skills[0] || keywords[0] || 'professional expertise';
  const skill2 = parsed.skills[1] || keywords[1] || 'stakeholder collaboration';

  const p1 = `I am applying for the ${role} at ${company}, a role that aligns closely with my professional background and the trajectory of my career. With a strong foundation in ${skill1} and ${skill2}, I am positioned to contribute immediately and deliver meaningful results.`;

  const exps = parsed.experience.slice(0, 2);
  const p2parts = exps.map(exp => {
    const rawBullet = exp.bullets[0] || `contributed to the objectives of ${exp.company || 'the organisation'}`;
    const verb = ACTION_VERBS[simpleHash(rawBullet) % ACTION_VERBS.length];
    const stripped = rawBullet
      .replace(/^(?:responsible\s+for|tasked\s+with|worked\s+on|assisted\s+with)\s+/i, '')
      .trim();
    const rewritten = verb + ' ' + stripped.charAt(0).toLowerCase() + stripped.slice(1);
    const kwMatch = keywords.find(kw => rawBullet.toLowerCase().includes(kw) || lowerJd.includes(kw));
    const companyStr = exp.company ? `at ${exp.company}` : 'in my previous role';
    const titleStr = exp.title ? `, serving as ${exp.title}` : '';
    return `${companyStr.charAt(0).toUpperCase() + companyStr.slice(1)}${titleStr}, I ${rewritten}${kwMatch ? ', demonstrating strong ' + kwMatch + ' capability' : ''}.`;
  });
  const p2 = p2parts.join(' ');

  const matchedSkills = parsed.skills.filter(s =>
    keywords.some(kw => s.toLowerCase().includes(kw) || kw.includes(s.toLowerCase()))
  );
  const displaySkills = [...matchedSkills, ...parsed.skills.filter(s => !matchedSkills.includes(s))].slice(0, 3);
  const skillPhrase = displaySkills.length >= 2
    ? displaySkills.slice(0, -1).join(', ') + ' and ' + displaySkills[displaySkills.length - 1]
    : displaySkills[0] || skill1;
  const kw0 = keywords[0] || 'core objectives';
  const p3 = `My proficiency in ${skillPhrase} directly addresses the requirements outlined for this position. I am keen to bring this expertise to ${company} and contribute to the team's ${kw0} goals and broader success.`;

  const contactStr = [parsed.email, parsed.phone].filter(Boolean).join(' or ');
  const contactFallback = contactStr || 'the contact details in my resume';
  const p4 = `I welcome the opportunity to discuss my application further and am available for interview at short notice. Please feel free to reach me at ${contactFallback}.`;

  const sigContact = [parsed.email, parsed.phone].filter(Boolean).join(' | ');

  const sections = [
    dateStr, '',
    'Hiring Manager' + (companyName ? ', ' + companyName : ''),
    'Re: ' + role + ' Position', '',
    p1, '',
    p2, '',
    p3, '',
    p4, '',
    'Yours sincerely,', '',
    parsed.name || '',
    sigContact,
  ];

  return enforceWordLimit(sections.join('\n'), 320);
}

function enforceWordLimit(text, maxWords) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length <= maxWords) return text;

  const paras = text.split('\n\n');
  for (let i = paras.length - 1; i >= 0; i--) {
    const paraWords = paras[i].split(/\s+/).filter(w => w.length > 0);
    const excess = words.length - maxWords;
    if (paraWords.length > excess + 10) {
      const trimmed = paraWords.slice(0, paraWords.length - excess).join(' ');
      if (!trimmed.endsWith('.')) {
        const lastDot = trimmed.lastIndexOf('.');
        paras[i] = lastDot > trimmed.length / 2 ? trimmed.slice(0, lastDot + 1) : trimmed + '.';
      } else {
        paras[i] = trimmed;
      }
      break;
    }
  }

  return paras.join('\n\n');
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

function processApplication(resumeText, jdText) {
  const kwResult = extractKeywords(jdText);
  const parsed = parseResume(resumeText);

  if (!parsed.name && parsed.experience.length === 0) {
    return {
      error: 'Could not recognise your resume. Please ensure it contains your name and work experience, then try again.',
    };
  }

  const resume = buildResume(parsed, kwResult, resumeText);
  const coverLetter = buildCoverLetter(parsed, kwResult, jdText);
  return { resume, coverLetter };
}

// ─── DOM References ───────────────────────────────────────────────────────────

const elResumeTextarea = document.getElementById('resume-textarea');
const elJdTextarea     = document.getElementById('jd-textarea');
const elGenerateBtn    = document.getElementById('generate-btn');
const elOutputArea     = document.getElementById('output-area');
const elResumePre      = document.getElementById('resume-output');
const elCoverPre       = document.getElementById('cover-output');
const elResumeCopy     = document.getElementById('resume-copy');
const elResumeDownload = document.getElementById('resume-download');
const elCoverCopy      = document.getElementById('cover-copy');
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

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function updateGenerateButton() {
  elGenerateBtn.disabled = !elResumeTextarea.value.trim() || !elJdTextarea.value.trim();
}

function showError(message) {
  elErrorMessage.textContent = message;
  elErrorArea.hidden = false;
}

function hideError() {
  elErrorArea.hidden = true;
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Event Listeners ──────────────────────────────────────────────────────────

elResumeTextarea.addEventListener('input', updateGenerateButton);
elJdTextarea.addEventListener('input', updateGenerateButton);

elGenerateBtn.addEventListener('click', () => {
  hideError();
  const resumeText = elResumeTextarea.value.trim();
  const jdText = elJdTextarea.value.trim();

  const result = processApplication(resumeText, jdText);

  if (result.error) {
    showError(result.error);
    return;
  }

  elResumePre.textContent = result.resume;
  elCoverPre.textContent = result.coverLetter;

  if (elOutputArea.hidden) {
    elOutputArea.hidden = false;
    elOutputArea.classList.add('visible');
  }

  elOutputArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

elSaveBtn.addEventListener('click', () => {
  try {
    localStorage.setItem(LS_RESUME_KEY, elResumeTextarea.value);
    const orig = elSaveBtn.textContent;
    elSaveBtn.textContent = 'Saved';
    setTimeout(() => { elSaveBtn.textContent = orig; }, 2000);
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      showError('Storage quota exceeded. Unable to save resume.');
    } else {
      showError('Failed to save: ' + (err.message || String(err)));
    }
  }
});

elClearBtn.addEventListener('click', () => {
  if (!window.confirm('Clear your saved resume? This cannot be undone.')) return;
  elResumeTextarea.value = '';
  try { localStorage.removeItem(LS_RESUME_KEY); } catch (_) {}
  updateGenerateButton();
});

elUploadBtn.addEventListener('click', () => elFileInput.click());

elFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  elFileInput.value = '';

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    elResumeTextarea.value = text.trim();
    updateGenerateButton();
  } catch (err) {
    showError('Failed to read PDF. Try pasting your resume text manually. (' + (err.message || String(err)) + ')');
  }
});

elErrorDismiss.addEventListener('click', hideError);

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

elResumeDownload.addEventListener('click', () => downloadText(elResumePre.textContent, 'tailored-resume.txt'));
elCoverDownload.addEventListener('click', () => downloadText(elCoverPre.textContent, 'cover-letter.txt'));

elHamburger.addEventListener('click', () => elSidebar.classList.toggle('open'));

// ─── Init ─────────────────────────────────────────────────────────────────────

(function init() {
  const saved = localStorage.getItem(LS_RESUME_KEY);
  if (saved) elResumeTextarea.value = saved;
  updateGenerateButton();
}());
