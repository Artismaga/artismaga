import { KokoroTTS, env } from 'kokoro-js';
// The pinned npm runtime's voice loader uses resolve/main. Rewrite asset requests
// inside this dedicated worker to the same immutable revision as model/tokenizer.
const REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
// Kokoro.js uses main-based cache keys internally. Namespace every cache by
// the immutable revision so an application update cannot reuse another model.
if ('caches' in globalThis) {
  const openCache = globalThis.caches.open.bind(globalThis.caches);
  globalThis.caches.open = (name) => openCache(`artismaga-kokoro-${REVISION}:${name}`);
}
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const pinned = url.replace(
    'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/',
    `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/${REVISION}/`,
  );
  return originalFetch(pinned, init);
};
env.wasmPaths = '/assets/tts/';
let model: KokoroTTS | null = null;
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (message: unknown, transfer: Transferable[]) => void;
};
scope.onmessage = (event) => {
  const data = event.data;
  if (
    !data ||
    typeof data !== 'object' ||
    !('text' in data) ||
    typeof data.text !== 'string' ||
    data.text.length > 500 ||
    !('speed' in data) ||
    typeof data.speed !== 'number' ||
    !Number.isFinite(data.speed) ||
    data.speed < 0.5 ||
    data.speed > 2
  )
    return;
  const text = data.text,
    speed = data.speed;
  void (async () => {
    try {
      model ??= await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        device: 'webgpu',
        dtype: 'fp32',
      });
      const audio = await model.generate(text, { voice: 'af_heart', speed });
      const samples = new Float32Array(audio.audio);
      scope.postMessage({ samples, rate: audio.sampling_rate }, [samples.buffer]);
    } catch {
      scope.postMessage({ error: true }, []);
    }
  })();
};
