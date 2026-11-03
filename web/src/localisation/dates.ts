/** Shared SSR/browser formatting: never inherit the operating system's time zone. */
export function formatDate(
  locale: string,
  timeZone: string,
  epochSeconds: number,
  style: 'date' | 'time' | 'datetime' | 'year' = 'datetime',
): string {
  const date = new Date(epochSeconds * 1000);
  if (!Number.isFinite(date.getTime())) return '—';
  const options: Intl.DateTimeFormatOptions =
    style === 'date'
      ? { dateStyle: 'medium' }
      : style === 'time'
        ? { timeStyle: 'medium' }
        : style === 'year'
          ? { year: 'numeric' }
          : { dateStyle: 'medium', timeStyle: 'medium' };
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date);
  }
}
