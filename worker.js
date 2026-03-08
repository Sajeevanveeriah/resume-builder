self.addEventListener('error', (e) => {
  self.postMessage({ type: 'error', message: e.message || e.filename || 'Worker script load error: ' + e.type });
});
self.addEventListener('unhandledrejection', (e) => {
  self.postMessage({ type: 'error', message: e.reason?.message || String(e.reason) || 'Unhandled promise rejection in worker' });
});

import { pipeline, env, TextStreamer } from './transformers.min.js';

env.allowLocalModels = false;

let generator = null;

self.addEventListener('message', async (event) => {
  const { type } = event.data;

  if (type === 'load') {
    try {
      generator = await pipeline(
        'text-generation',
        'Xenova/Phi-3-mini-4k-instruct',
        {
          progress_callback: (progressInfo) => {
            let progress = 0;
            if (typeof progressInfo.progress === 'number') {
              progress = progressInfo.progress / 100;
            } else if (progressInfo.loaded && progressInfo.total) {
              progress = progressInfo.loaded / progressInfo.total;
            }
            const status = progressInfo.file
              ? `Downloading ${progressInfo.file}`
              : (progressInfo.status || 'Loading...');
            self.postMessage({ type: 'progress', progress, status });
          },
        }
      );
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: err?.message || String(err) || 'Failed to load model' });
    }
    return;
  }

  if (type === 'generate') {
    if (!generator) {
      self.postMessage({ type: 'error', message: 'Model not loaded. Please reload the page and wait for the model to finish loading.' });
      return;
    }

    const { systemPrompt, userPrompt } = event.data;
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const streamer = new TextStreamer(generator.tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (text) => {
          self.postMessage({ type: 'token', text });
        },
      });

      await generator(messages, {
        max_new_tokens: 2048,
        do_sample: false,
        temperature: 1,
        streamer,
      });

      self.postMessage({ type: 'done' });
    } catch (err) {
      self.postMessage({ type: 'error', message: err?.message || String(err) || 'Generation failed' });
    }
    return;
  }
});
