self.addEventListener('error', (e) => {
  self.postMessage({ type: 'error', message: e.message || e.filename || 'Worker script load error: ' + e.type });
});
self.addEventListener('unhandledrejection', (e) => {
  self.postMessage({ type: 'error', message: e.reason?.message || String(e.reason) || 'Unhandled promise rejection in worker' });
});
import { pipeline, env, TextStreamer } from './transformers.min.js';

const MODEL_ID = "Xenova/Phi-3-mini-4k-instruct";

let generator = null;
let isLoading = false;

self.onmessage = async (event) => {
  const data = event.data;

  if (data?.type === "load") {
    await loadModel();
    return;
  }

  if (data?.type === "generate") {
    await generateText(data.systemPrompt, data.userPrompt);
  }
};

async function loadModel() {
  if (generator || isLoading) {
    return;
  }

  isLoading = true;

  try {
    generator = await pipeline("text-generation", MODEL_ID, {
      progress_callback: (progress) => {
        const value = typeof progress?.progress === "number" ? progress.progress : 0;
        const status = progress?.status || "Downloading model files...";
        self.postMessage({
          type: "progress",
          progress: Math.max(0, Math.min(1, value)),
          status,
        });
      },
    });

    self.postMessage({ type: "ready" });
  } catch (error) {
    self.postMessage({ type: "error", message: String(error) });
  } finally {
    isLoading = false;
  }
}

async function generateText(systemPrompt, userPrompt) {
  if (!generator) {
    self.postMessage({ type: "error", message: "Model is not ready yet. Please wait for loading to complete." });
    return;
  }

  try {
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const streamer = new TextStreamer(generator.tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: (textChunk) => {
        if (textChunk) {
          self.postMessage({ type: "token", text: textChunk });
        }
      },
    });

    await generator(messages, {
      max_new_tokens: 1400,
      do_sample: false,
      temperature: 0.2,
      repetition_penalty: 1.05,
      streamer,
      return_full_text: false,
    });

    self.postMessage({ type: "done" });
  } catch (error) {
    self.postMessage({ type: "error", message: String(error) });
  }
}
