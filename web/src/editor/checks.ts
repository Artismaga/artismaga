import type { RichNode } from '../shared/writing.js';
import { plainText } from './document.js';
export type WritingIssue = { key: string; example: string };
/** Deliberately local, small rules. Browser dictionaries handle spelling separately. */
export function writingChecks(document: RichNode, language: string): WritingIssue[] {
  const issues: WritingIssue[] = [];
  const text = plainText(document);
  const add = (key: string, example: string) => {
    if (issues.length < 50) issues.push({ key, example: example.slice(0, 120) });
  };
  if (['en', 'es', 'fr'].includes(language)) {
    for (const m of text.matchAll(/(?<!\p{L})([\p{L}]+)\s+\1(?!\p{L})/giu))
      add('editor.check.repeated', m[0]);
    for (const m of text.matchAll(/\S {2,}\S/gu)) add('editor.check.spacing', m[0]);
  }
  if (language === 'en') {
    for (const m of text.matchAll(/\b(a [aeiou][a-z]+|an [bcdfgjklmnpqrstvwxyz][a-z]+)\b/gi))
      add('editor.check.article', m[0]);
  }
  for (const m of text.matchAll(/[!?！？]{3,}/gu)) add('editor.check.punctuation', m[0]);
  let previous = 1;
  function walk(node: RichNode) {
    if (node.type === 'heading') {
      const level = Number(node.attrs?.['level'] ?? 2);
      if (level > previous + 1) add('editor.check.heading', plainText(node));
      previous = level;
      if (!plainText(node).trim()) add('editor.check.empty_heading', '');
    }
    if (node.type === 'paragraph' && plainText(node).trim().length > 1800)
      add('editor.check.long_paragraph', plainText(node));
    for (const mark of node.marks ?? [])
      if (
        mark.type === 'link' &&
        /^(here|click here|link|こちら|这里|aquí|ici)$/i.test(plainText(node).trim())
      )
        add('editor.check.link', plainText(node));
    for (const child of node.content ?? []) walk(child);
  }
  walk(document);
  return issues;
}
