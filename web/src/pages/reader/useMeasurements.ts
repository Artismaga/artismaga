import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { chapterStatsSchema } from '../../shared/reader.js';
import type { PageProps } from '../../shared/contracts.js';
export function useMeasurements(
  data: NonNullable<PageProps['reader']>,
  position: number,
  revision: number,
) {
  const [stats, setStats] = useState(data.stats);
  const viewed = useRef(false),
    completed = useRef(false),
    queue = useRef(Promise.resolve());
  const path = `/api/reader/${data.work}/${data.chapter.uid}`;
  useEffect(() => {
    let stopped = false;
    async function refresh() {
      try {
        const response = await fetch(`${path}/stats`, { cache: 'no-store' });
        if (!response.ok) return;
        const value = z
          .object({ stats: chapterStatsSchema })
          .strict()
          .parse(await response.json());
        if (!stopped) setStats(value.stats);
      } catch {
        /* Offline keeps the last public totals. */
      }
    }
    void refresh();
    return () => {
      stopped = true;
    };
  }, [path, revision]);
  useEffect(() => {
    function record() {
      if (document.visibilityState !== 'visible') return;
      const complete = position >= 0.95;
      if (viewed.current && (!complete || completed.current)) return;
      const alreadyViewed = viewed.current;
      viewed.current = true;
      if (complete) completed.current = true;
      queue.current = queue.current.then(async () => {
        try {
          const response = await fetch(`${path}/measure`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: complete ? 1 : 0 }),
            keepalive: true,
          });
          if (!response.ok) throw Error();
        } catch {
          if (!alreadyViewed) viewed.current = false;
          if (complete) completed.current = false;
        }
      });
    }
    record();
    document.addEventListener('visibilitychange', record);
    window.addEventListener('online', record);
    return () => {
      document.removeEventListener('visibilitychange', record);
      window.removeEventListener('online', record);
    };
  }, [path, position]);
  return stats;
}
