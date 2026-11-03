import { diffWordsWithSpace } from 'diff';
import type { RichNode } from '../shared/writing.js';
import { plainText } from './document.js';
export interface Highlight {
  from: number;
  to: number;
  kind: 'added' | 'removed';
}
/** Bounded textual comparison. Offsets share RichDocument's UTF-16/plainText traversal. */
export function revisionHighlights(
  before: RichNode,
  after: RichNode,
): { before: Highlight[]; after: Highlight[] } | null {
  const changes = diffWordsWithSpace(plainText(before), plainText(after), {
    timeout: 60,
    maxEditLength: 10000,
  });
  if (!changes) return null;
  const result: { before: Highlight[]; after: Highlight[] } = { before: [], after: [] };
  let left = 0,
    right = 0;
  for (const change of changes) {
    if (change.removed)
      result.before.push({ from: left, to: left + change.value.length, kind: 'removed' });
    if (change.added)
      result.after.push({ from: right, to: right + change.value.length, kind: 'added' });
    if (!change.added) left += change.value.length;
    if (!change.removed) right += change.value.length;
  }
  return result;
}
