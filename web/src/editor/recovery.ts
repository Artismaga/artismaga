import { z } from 'zod';
import { manuscriptSchema } from '../shared/writing.js';
export const recoverySchema = z
  .object({
    base_revision: z.number().int().nonnegative(),
    saved_at: z.number(),
    value: manuscriptSchema,
  })
  .strict();
export type Recovery = z.infer<typeof recoverySchema>;
export function recoveryKey(user: string, work: string, chapter: string): string {
  return `artismaga:draft:${user}:${work}:${chapter}`;
}
export function readRecovery(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  key: string,
  now = Date.now(),
): Recovery | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    if (raw.length > 750000) {
      storage.removeItem(key);
      return null;
    }
    const value = recoverySchema.parse(JSON.parse(raw));
    if (now - value.saved_at > 7 * 24 * 3600 * 1000 || value.saved_at > now + 60000) {
      storage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
