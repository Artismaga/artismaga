import { useFeedback } from '../components/Feedback.js';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { draftSchema } from '../shared/writing.js';
import type { Draft, Manuscript } from '../shared/writing.js';
import { readRecovery } from './recovery.js';
import type { Recovery } from './recovery.js';
export function useDraft(initial: Draft, endpoint: string, key: string, canEdit: boolean) {
  const [value, setValue] = useState(initial.value);
  const current = useRef(value);
  const revision = useRef(initial.revision);
  const serial = useRef(0);
  const saved = useRef(0);
  const [generation, setGeneration] = useState(0);
  const [savedGeneration, setSavedGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useFeedback('error');
  const [, savedNotice] = useFeedback('success');
  const [blocked, setBlocked] = useState(false);
  const validationFailure = useRef(false);
  const [lastSaved, setLastSaved] = useState(initial.updated_at);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [recoveryUnavailable, setRecoveryUnavailable] = useState(false);
  useEffect(() => {
    if (recoveryUnavailable) setError('editor.recovery.unavailable');
  }, [recoveryUnavailable]);
  const failures = useRef(0);
  const dirty = generation !== savedGeneration;
  const writeRecovery = () => {
    if (!canEdit) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          base_revision: revision.current,
          saved_at: Date.now(),
          value: current.current,
        }),
      );
    } catch {
      setRecoveryUnavailable(true);
    }
  };
  useEffect(() => {
    mounted.current = true;
    if (canEdit) {
      try {
        const cached = readRecovery(localStorage, key);
        if (cached && JSON.stringify(cached.value) !== JSON.stringify(initial.value))
          setRecovery(cached);
      } catch {
        setRecoveryUnavailable(true);
      }
    }
    return () => {
      mounted.current = false;
    };
  }, [key]);
  function mutate(next: Manuscript) {
    if (validationFailure.current) {
      validationFailure.current = false;
      setBlocked(false);
      setError('');
    }
    current.current = next;
    serial.current += 1;
    setValue(next);
    setGeneration(serial.current);
    writeRecovery();
  }
  function adopt(draft: Draft) {
    revision.current = draft.revision;
    current.current = draft.value;
    serial.current += 1;
    saved.current = serial.current;
    setValue(draft.value);
    setGeneration(serial.current);
    setSavedGeneration(serial.current);
    setLastSaved(draft.updated_at);
    setBlocked(false);
    setError('');
    setRecovery(null);
    try {
      localStorage.removeItem(key);
    } catch {
      /* Server content remains available. */
    }
  }
  async function save(checkpoint = true): Promise<boolean> {
    if (!canEdit || inFlight.current || blocked || recovery) return false;
    inFlight.current = true;
    setBusy(true);
    setError('');
    const sent = serial.current;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: revision.current, value: current.current, checkpoint }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        if (response.status === 400 || response.status === 413 || response.status === 422) {
          validationFailure.current = true;
          setBlocked(true);
          throw Error('editor.error.invalid');
        }
        if ([401, 403, 404, 409].includes(response.status)) {
          setBlocked(true);
          throw Error('editor.error.conflict');
        }
        throw Error('editor.error.save');
      }
      const result = z.object({ draft: draftSchema }).parse(await response.json()).draft;
      revision.current = result.revision;
      saved.current = sent;
      failures.current = 0;
      if (mounted.current) {
        setSavedGeneration(sent);
        setLastSaved(result.updated_at);
      }
      if (serial.current === sent) {
        try {
          localStorage.removeItem(key);
        } catch {
          /* Already saved on the server. */
        }
      } else writeRecovery();
      if (checkpoint && mounted.current) savedNotice('editor.saved');
      return true;
    } catch (e: unknown) {
      failures.current += 1;
      if (mounted.current)
        setError(
          e instanceof Error && e.message.startsWith('editor.') ? e.message : 'editor.error.save',
        );
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!dirty || !canEdit || blocked || recovery || busy) return;
    const timer = setTimeout(
      () => void save(false),
      Math.min(30000, 2000 * 2 ** Math.min(failures.current, 4)),
    );
    return () => clearTimeout(timer);
  }, [generation, savedGeneration, busy, blocked, recovery, canEdit]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (serial.current !== saved.current) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  return {
    value,
    current,
    mutate,
    adopt,
    revision,
    busy,
    dirty,
    error,
    blocked,
    lastSaved,
    recovery,
    recoveryUnavailable,
    save,
    recover: () => {
      if (recovery) {
        setRecovery(null);
        mutate(recovery.value);
      }
    },
    discardRecovery: () => {
      setRecovery(null);
      try {
        localStorage.removeItem(key);
      } catch {
        /* No persisted recovery copy. */
      }
    },
    rebase: (draft: Draft) => {
      revision.current = draft.revision;
      setBlocked(false);
      setError('');
      serial.current += 1;
      setGeneration(serial.current);
      writeRecovery();
    },
  };
}
