import { useEffect, useRef, useState } from 'react';
export function supportsKokoro(
  language: string,
  device: {
    gpu?: unknown;
    hardwareConcurrency?: number;
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  },
): boolean {
  return (
    language.split('-')[0] === 'en' &&
    !!device.gpu &&
    (device.hardwareConcurrency ?? 0) >= 4 &&
    (device.deviceMemory === undefined || device.deviceMemory >= 4) &&
    !device.connection?.saveData
  );
}
export function useSpeech(text: string, language: string, speed: number, onError: () => void) {
  const [status, setStatus] = useState<'stopped' | 'loading' | 'playing' | 'paused'>('stopped'),
    [available, setAvailable] = useState(false);
  const generation = useRef(0),
    worker = useRef<Worker | null>(null),
    context = useRef<AudioContext | null>(null),
    timer = useRef(0),
    paused = useRef(false);
  function stop() {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    window.clearTimeout(timer.current);
    void context.current?.close();
    context.current = null;
    window.speechSynthesis?.cancel();
    paused.current = false;
    setStatus('stopped');
  }
  useEffect(() => {
    setAvailable('speechSynthesis' in window || supportsKokoro(language, navigator));
    return stop;
  }, [text, language]);
  function native(chunks: string[], start: number, token: number) {
    if (token !== generation.current) return;
    worker.current?.terminate();
    worker.current = null;
    window.clearTimeout(timer.current);
    const synth = window.speechSynthesis;
    const voices = synth?.getVoices() ?? [];
    const voice =
      voices.find(
        (v) => v.localService && v.lang.toLowerCase().split('-')[0] === language.split('-')[0],
      ) ?? voices.find((v) => v.lang.toLowerCase().split('-')[0] === language.split('-')[0]);
    if (!synth || !voice) {
      setStatus('stopped');
      onError();
      return;
    }
    let index = start;
    function next() {
      if (token !== generation.current) return;
      const chunk = chunks[index++];
      if (!chunk) {
        setStatus('stopped');
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = language;
      utterance.voice = voice ?? null;
      utterance.rate = speed;
      utterance.onend = next;
      utterance.onerror = () => {
        if (token === generation.current) {
          setStatus('stopped');
          onError();
        }
      };
      synth.speak(utterance);
    }
    setStatus(paused.current ? 'paused' : 'playing');
    next();
    if (paused.current) synth.pause();
  }
  function play() {
    if (status === 'paused') {
      paused.current = false;
      void context.current?.resume();
      window.speechSynthesis?.resume();
      setStatus('playing');
      return;
    }
    stop();
    const token = generation.current;
    const chunks = text.match(/[\s\S]{1,220}(?:\s|$)|[\s\S]{1,220}/g) ?? [];
    if (!supportsKokoro(language, navigator) || typeof Worker === 'undefined') {
      native(chunks, 0, token);
      return;
    }
    let index = 0;
    setStatus('loading');
    try {
      context.current = new AudioContext();
      void context.current.resume();
      worker.current = new Worker('/assets/tts/speech-worker.js', { type: 'module' });
      let fallingBack = false;
      const fail = () => {
        if (fallingBack) return;
        fallingBack = true;
        if (token === generation.current) {
          void context.current?.close();
          context.current = null;
          native(chunks, index, token);
        }
      };
      function request() {
        const chunk = chunks[index];
        if (!chunk) {
          stop();
          return;
        }
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(fail, index === 0 ? 60000 : 15000);
        worker.current?.postMessage({ text: chunk, speed });
      }
      worker.current.onerror = fail;
      worker.current.onmessage = (event: MessageEvent<unknown>) => {
        if (token !== generation.current) return;
        window.clearTimeout(timer.current);
        const data = event.data;
        if (
          !data ||
          typeof data !== 'object' ||
          !('samples' in data) ||
          !(data.samples instanceof Float32Array) ||
          !('rate' in data) ||
          data.rate !== 24000 ||
          data.samples.length > 24000 * 120
        ) {
          fail();
          return;
        }
        const ctx = context.current;
        if (!ctx) {
          fail();
          return;
        }
        const audio = ctx.createBuffer(1, data.samples.length, 24000);
        audio.copyToChannel(new Float32Array(data.samples), 0);
        const source = ctx.createBufferSource();
        source.buffer = audio;
        source.connect(ctx.destination);
        source.onended = () => {
          if (token === generation.current) {
            index++;
            request();
          }
        };
        source.start();
        setStatus(paused.current ? 'paused' : 'playing');
      };
      request();
    } catch {
      native(chunks, 0, token);
    }
  }
  function pause() {
    paused.current = true;
    void context.current?.suspend();
    window.speechSynthesis?.pause();
    setStatus('paused');
  }
  return { status, available, play, pause, stop };
}
