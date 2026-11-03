import { useEffect, useState } from 'react';
/** Keep tabs instant, shareable and navigable through browser Back/Forward. */
export function usePathTab(initial: string, prefix: string, allowed: readonly string[]) {
  const [active, setActive] = useState<string | null>(initial);
  useEffect(() => {
    const sync = () => {
      const part = window.location.pathname.slice(prefix.length + 1);
      const next = allowed.includes(part) ? part : (allowed[0] ?? initial);
      setActive(next);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [initial, prefix, allowed]);
  return [
    active,
    (value: string | null) => {
      if (!value || !allowed.includes(value)) return;
      setActive(value);
      history.pushState(null, '', `${prefix}/${value}`);
    },
  ] as const;
}
