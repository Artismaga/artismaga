import { formatDate } from './dates.js';
import { sources } from './sources.js';
import { createContext, useContext } from 'react';
export type Values = Record<string, string | number>;
export interface LocalisationValue {
  locale: string;
  timezone: string;
  now: number;
  messages: Record<string, string>;
  sources: Record<string, string>;
  preview: boolean;
}
export const LocalisationContext = createContext<LocalisationValue>({
  locale: 'en',
  timezone: 'UTC',
  now: 0,
  messages: sources,
  sources,
  preview: false,
});
export function formatMessage(text: string, values: Values = {}): string {
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (whole: string, key: string) =>
    values[key] === undefined ? whole : String(values[key]),
  );
}
export function translate(value: LocalisationValue, key: string, values: Values = {}): string {
  return formatMessage(value.messages[key] ?? value.sources[key] ?? key, values);
}
export function useI18n() {
  const value = useContext(LocalisationContext);
  const t = (key: string, values: Values = {}) => translate(value, key, values);
  const tx = (input: string | undefined) => {
    const text = input ?? '';
    const key = Object.keys(value.sources).find((key) => value.sources[key] === text);
    return key ? t(key) : text;
  };
  function options<T>(data: T): T {
    if (Array.isArray(data))
      return data.map((item) =>
        typeof item === 'string' ? { value: item, label: tx(item) } : options(item),
      ) as T;
    if (data && typeof data === 'object') {
      const next = { ...data } as Record<string, unknown>;
      if (typeof next['label'] === 'string') next['label'] = tx(next['label']);
      if (Array.isArray(next['items'])) next['items'] = options(next['items']);
      return next as T;
    }
    return data;
  }
  return {
    t,
    tx,
    options,
    date: (epoch: number, style: 'date' | 'time' | 'datetime' | 'year' = 'datetime') =>
      formatDate(value.locale, value.timezone, epoch, style),
    ...value,
  };
}
