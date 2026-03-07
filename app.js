const RESUME_KEY = "resume_text";
const NOTICE_KEY = "model_notice_dismissed";
const COVER_SEPARATOR = "---COVER_LETTER---";
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
- Structure: Para 1 (hook). Para 2 (two specific achievements mapped to JD). Para 3 (skills alignment, forward-looking). Para 4 (call to action, availability).
- Tone: direct, confident, no filler, no superlatives.
- Length: 260-320 words hard limit.

OUTPUT FORMAT:
Write the resume in full. Then insert exactly this separator on its own line:
---COVER_LETTER---
Then write the cover letter. No preamble, no commentary, no labels other than the separator.`;

const ui = {
  sidebar: document.getElementById("sidebar"),
  menuToggle: document.getElementById("menuToggle"),
  modelLoader: document.getElementById("modelLoader"),
  loaderLabel: document.getElementById("loaderLabel"),
  loaderTrack: document.getElementById("loaderTrack"),
  loaderFill: document.getElementById("loaderFill"),
  loaderMeta: document.getElementById("loaderMeta"),
  noticeBanner: document.getElementById("noticeBanner"),
  dismissNotice: document.getElementById("dismissNotice"),
  resumeInput: document.getElementById("resumeInput"),
  resumePdf: document.getElementById("resumePdf"),
  uploadPdfLabel: document.getElementById("uploadPdfLabel"),
  saveResume: document.getElementById("saveResume"),
  clearResume: document.getElementById("clearResume"),
  jdInput: document.getElementById("jdInput"),
  generateBtn: document.getElementById("generateBtn"),
  errorArea: document.getElementById("errorArea"),
  errorText: document.getElementById("errorText"),
  dismissError: document.getElementById("dismissError"),
  outputArea: document.getElementById("outputArea"),
  resumeOutput: document.getElementById("resumeOutput"),
  coverOutput: document.getElementById("coverOutput"),
  copyResume: document.getElementById("copyResume"),
  downloadResume: document.getElementById("downloadResume"),
  copyCover: document.getElementById("copyCover"),
  downloadCover: document.getElementById("downloadCover"),
};

const worker = MOCK_MODE ? null : new Worker("worker.js", { type: "module" });

let isModelReady = false;
let isGenerating = false;
let streamBuffer = "";

ui.resumeInput.value = localStorage.getItem(RESUME_KEY) || "";

if (!localStorage.getItem(NOTICE_KEY)) {
  ui.noticeBanner.classList.remove("hidden");
}

ui.dismissNotice.addEventListener("click", () => {
  localStorage.setItem(NOTICE_KEY, "true");
  ui.noticeBanner.classList.add("hidden");
});

ui.menuToggle.addEventListener("click", () => {
  const open = ui.sidebar.classList.toggle("open");
  ui.menuToggle.setAttribute("aria-expanded", String(open));
});

ui.dismissError.addEventListener("click", clearError);

ui.resumeInput.addEventListener("input", updateGenerateState);
ui.jdInput.addEventListener("input", updateGenerateState);

ui.saveResume.addEventListener("click", () => {
  try {
    localStorage.setItem(RESUME_KEY, ui.resumeInput.value);
    const originalText = ui.saveResume.textContent;
    ui.saveResume.textContent = "Saved";
    ui.saveResume.disabled = true;
    setTimeout(() => {
      ui.saveResume.textContent = originalText;
      ui.saveResume.disabled = false;
      updateGenerateState();
    }, 2000);
  } catch (error) {
    if (error?.name === "QuotaExceededError") {
      showError("Storage limit reached. Clear your saved resume and retry.");
      return;
    }
    showError(String(error));
  }
});

ui.clearResume.addEventListener("click", () => {
  if (!window.confirm("Clear your saved resume text?")) {
    return;
  }
  ui.resumeInput.value = "";
  localStorage.removeItem(RESUME_KEY);
  updateGenerateState();
});

ui.resumePdf.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    if (window.pdfjsLib?.GlobalWorkerOptions) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
    let text = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(" ");
      text += `${pageText}\n\n`;
    }

    ui.resumeInput.value = text.trim();
    updateGenerateState();
  } catch (error) {
    alert("The PDF could not be parsed. Please paste text manually.");
  } finally {
    ui.resumePdf.value = "";
  }
});

ui.generateBtn.addEventListener("click", generate);
ui.copyResume.addEventListener("click", () => copyText(ui.resumeOutput.textContent));
ui.copyCover.addEventListener("click", () => copyText(ui.coverOutput.textContent));
ui.downloadResume.addEventListener("click", () => downloadText("tailored_resume.txt", ui.resumeOutput.textContent));
ui.downloadCover.addEventListener("click", () => downloadText("cover_letter.txt", ui.coverOutput.textContent));

function handleWorkerMessage(data) {
  if (data?.type === "progress") {
    const progress = Math.max(0, Math.min(1, Number(data.progress || 0)));
    ui.loaderFill.style.width = `${(progress * 100).toFixed(1)}%`;
    ui.loaderTrack.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
    ui.loaderMeta.textContent = data.status || "Downloading model files...";
    return;
  }

  if (data?.type === "ready") {
    isModelReady = true;
    ui.loaderFill.style.width = "100%";
    ui.loaderTrack.setAttribute("aria-valuenow", "100");
    ui.loaderLabel.textContent = "AI ready";
    ui.loaderMeta.textContent = "Model loaded successfully and cached in this browser.";

    setTimeout(() => {
      ui.modelLoader.classList.add("fade-out");
      setTimeout(() => ui.modelLoader.classList.add("hidden"), 260);
    }, 3000);

    updateGenerateState();
    return;
  }

  if (data?.type === "token") {
    streamBuffer += data.text || "";
    renderStream(streamBuffer);
    return;
  }

  if (data?.type === "done") {
    isGenerating = false;
    ui.generateBtn.textContent = "Tailor My Application";
    disableOutputActions(false);
    updateGenerateState();
    return;
  }

  if (data?.type === "error") {
    isGenerating = false;
    ui.generateBtn.textContent = "Tailor My Application";
    showError(data.message || "An unknown error occurred.");
    updateGenerateState();
  }
}

if (worker) {
  worker.onmessage = (event) => {
    handleWorkerMessage(event.data);
  };

  worker.onerror = (e) => {
    const msg = e.message
      ? `Worker error: ${e.message} (${e.filename}:${e.lineno})`
      : 'Worker failed to load. Check that transformers.min.js exists and is served correctly.';
    showError(msg);
    console.error('Worker onerror:', e);
  };

  worker.postMessage({ type: "load" });
} else {
  const banner = document.createElement("section");
  banner.className = "error-banner";
  banner.style.marginTop = "0";
  banner.innerHTML = "<div>Mock mode active. AI generation is simulated.</div>";
  ui.modelLoader.parentElement.insertBefore(banner, ui.modelLoader);

  setTimeout(() => {
    handleWorkerMessage({ type: "ready" });
  }, 1500);
}

updateGenerateState();

function updateGenerateState() {
  const hasInputs = ui.resumeInput.value.trim().length > 0 && ui.jdInput.value.trim().length > 0;
  ui.generateBtn.disabled = !isModelReady || isGenerating || !hasInputs;
}

function showError(message) {
  ui.errorText.textContent = message;
  ui.errorArea.classList.remove("hidden");
}

function clearError() {
  ui.errorText.textContent = "";
  ui.errorArea.classList.add("hidden");
}

function disableOutputActions(disabled) {
  ui.copyResume.disabled = disabled;
  ui.downloadResume.disabled = disabled;
  ui.copyCover.disabled = disabled;
  ui.downloadCover.disabled = disabled;
}

function generate() {
  if (!isModelReady || isGenerating) {
    return;
  }

  isGenerating = true;
  clearError();
  streamBuffer = "";

  ui.outputArea.classList.remove("hidden");
  ui.resumeOutput.textContent = "";
  ui.coverOutput.textContent = "";
  disableOutputActions(true);

  ui.generateBtn.textContent = "Generating...";
  ui.generateBtn.disabled = true;

  if (MOCK_MODE) {
    setTimeout(() => {
      handleWorkerMessage({ type: "token", text: "[MOCK OUTPUT] Resume rewriting is not available in test mode." });
      handleWorkerMessage({ type: "done" });
    }, 1000);
    return;
  }

  worker.postMessage({
    type: "generate",
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `SOURCE RESUME:\n${ui.resumeInput.value}\n\nJOB DESCRIPTION:\n${ui.jdInput.value}`,
  });
}

function renderStream(fullText) {
  const splitIndex = fullText.indexOf(COVER_SEPARATOR);

  if (splitIndex === -1) {
    ui.resumeOutput.textContent = fullText;
    ui.coverOutput.textContent = "";
    return;
  }

  ui.resumeOutput.textContent = fullText.slice(0, splitIndex).trimEnd();
  ui.coverOutput.textContent = fullText.slice(splitIndex + COVER_SEPARATOR.length).trimStart();
}

async function copyText(text) {
  if (!text?.trim()) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    showError(`Copy failed: ${String(error)}`);
  }
}

function downloadText(fileName, text) {
  if (!text?.trim()) {
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
