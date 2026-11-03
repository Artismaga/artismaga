import { useEffect, useRef, useState } from 'react';
import { emptyReadingState, readingStateSchema } from '../../shared/reader.js';
import type { ReadingState } from '../../shared/reader.js';
import { z } from 'zod';
const envelope = z
  .object({
    account: z.string().nullable(),
    state: readingStateSchema.nullable(),
    can_react: z.boolean(),
    can_rate: z.boolean(),
  })
  .strict();
export function useReading(work: string, chapter: string) {
  const [value, setValue] = useState(emptyReadingState);
  const [authenticated, setAuthenticated] = useState(false);
  const [canReact, setCanReact] = useState(false),
    [canRate, setCanRate] = useState(false);
  const [status, setStatus] = useState<
    'device' | 'synced' | 'pending' | 'conflict' | 'unavailable'
  >('device');
  const conflicted = useRef(false);
  const current = useRef(emptyReadingState),
    dirty = useRef(false),
    busy = useRef(false),
    ready = useRef(false),
    account = useRef<string | null>(null);
  const storageKey = () => `artismaga:reading:${account.current ?? 'guest'}:${work}:${chapter}`;
  const endpoint = `/api/reader/${work}/${chapter}/state`;
  function local(next: ReadingState) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ state: next, pending: dirty.current }));
    } catch {
      setStatus('unavailable');
    }
  }
  function update(patch: Partial<Pick<ReadingState, 'position' | 'rating' | 'reactions'>>) {
    if (!ready.current) return;
    current.current = { ...current.current, ...patch, updated_at: Math.floor(Date.now() / 1000) };
    setValue(current.current);
    dirty.current = true;
    local(current.current);
    if (account.current && !conflicted.current) setStatus('pending');
  }
  async function flush(force = false) {
    if (
      !ready.current ||
      !account.current ||
      !dirty.current ||
      busy.current ||
      (!force && conflicted.current)
    )
      return;
    busy.current = true;
    const sent = current.current;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: account.current, state: sent }),
        keepalive: true,
      });
      if (response.status === 409) {
        conflicted.current = true;
        setStatus('conflict');
        return;
      }
      if (!response.ok) throw Error();
      const data = z
        .object({ state: readingStateSchema })
        .passthrough()
        .parse(await response.json());
      current.current = { ...current.current, revision: data.state.revision };
      dirty.current =
        current.current.updated_at !== sent.updated_at ||
        current.current.position !== sent.position ||
        current.current.rating !== sent.rating ||
        JSON.stringify(current.current.reactions) !== JSON.stringify(sent.reactions);
      setValue(current.current);
      local(current.current);
      setStatus(dirty.current ? 'pending' : 'synced');
    } catch {
      setStatus('pending');
    } finally {
      busy.current = false;
    }
  }
  async function useDevice() {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) throw Error();
      const remote = envelope.parse(await response.json());
      if (!remote.state || remote.account !== account.current) {
        setStatus('conflict');
        return;
      }
      current.current = { ...current.current, revision: remote.state.revision };
      dirty.current = true;
      conflicted.current = false;
      await flush(true);
    } catch {
      setStatus(conflicted.current ? 'conflict' : 'pending');
    }
  }
  useEffect(() => {
    let stopped = false;
    void (async () => {
      let initial = emptyReadingState;
      let connected = false;
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (!response.ok) throw Error();
        const data = envelope.parse(await response.json());
        connected = true;
        account.current = data.account;
        try {
          if (data.account) sessionStorage.setItem('artismaga:reader-account', data.account);
          else sessionStorage.removeItem('artismaga:reader-account');
        } catch {
          /* Optional. */
        }
        setAuthenticated(data.state !== null);
        setCanReact(data.can_react);
        setCanRate(data.can_rate);
        if (data.state) {
          initial = data.state;
          setStatus('synced');
        }
      } catch {
        try {
          account.current = sessionStorage.getItem('artismaga:reader-account');
        } catch {
          /* Optional. */
        }
        setStatus('device');
      }
      try {
        const raw: unknown = JSON.parse(localStorage.getItem(storageKey()) ?? 'null');
        const stored = z
          .object({ state: readingStateSchema, pending: z.boolean() })
          .strict()
          .safeParse(raw);
        const legacy = readingStateSchema.safeParse(raw);
        const saved = stored.success ? stored.data.state : legacy.success ? legacy.data : null;
        const pending = stored.success ? stored.data.pending : false;
        if (saved && (!connected || !account.current || pending)) {
          if (connected && account.current && saved.revision !== initial.revision) {
            conflicted.current = true;
            setStatus('conflict');
          }
          initial = saved;
          dirty.current = account.current !== null && pending;
        }
      } catch {
        /* Storage is optional. */
      }
      if (stopped) return;
      current.current = initial;
      setValue(initial);
      const prose = document.getElementById('reader-prose');
      if (prose && initial.position > 0 && !window.location.hash.startsWith('#comment-'))
        window.scrollTo({
          top:
            prose.offsetTop +
            initial.position * Math.max(0, prose.offsetHeight - window.innerHeight),
        });
      ready.current = true;
    })();
    function scroll() {
      if (!ready.current) return;
      const prose = document.getElementById('reader-prose');
      if (!prose) return;
      const position = Math.max(
        0,
        Math.min(
          1,
          (window.scrollY - prose.offsetTop) / Math.max(1, prose.offsetHeight - window.innerHeight),
        ),
      );
      update({ position });
    }
    const timer = window.setInterval(() => {
      void flush();
    }, 10000);
    let scrollTimer = 0;
    const delayed = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(scroll, 300);
    };
    const leaving = () => {
      scroll();
      void flush();
    };
    window.addEventListener('scroll', delayed, { passive: true });
    window.addEventListener('pagehide', leaving);
    window.addEventListener('online', leaving);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.clearTimeout(scrollTimer);
      window.removeEventListener('scroll', delayed);
      window.removeEventListener('pagehide', leaving);
      window.removeEventListener('online', leaving);
    };
  }, [endpoint]);
  // Feedback changes flush promptly; scrolling uses the bounded periodic save.
  useEffect(() => {
    if (status !== 'conflict' && status === 'pending') void flush();
  }, [value.rating, JSON.stringify(value.reactions)]);
  return { value, update, authenticated, canReact, canRate, status, useDevice };
}
