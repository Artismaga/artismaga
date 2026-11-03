import type { Node } from '@tiptap/pm/model';
export interface Match {
  from: number;
  to: number;
}
export function findMatches(document: Node, query: string, caseSensitive: boolean): Match[] {
  if (!query || query.length > 500) return [];
  const matches: Match[] = [];
  document.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textBetween(0, node.content.size, '', '\n');
    const flags = caseSensitive ? 'gu' : 'giu';
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const match of text.matchAll(new RegExp(escaped, flags))) {
      if (matches.length >= 500) break;
      matches.push({ from: pos + 1 + match.index, to: pos + 1 + match.index + match[0].length });
    }
    return false;
  });
  return matches;
}
