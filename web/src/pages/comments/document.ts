import type { JSONContent } from '@tiptap/react';
import emoji from '../../shared/twemoji.json' with { type: 'json' };
const codes = new Set(emoji.map((e) => e.code));
export function emojiCode(text: string): string | null {
  const points = Array.from(text);
  const exact = points.map((c) => c.codePointAt(0)?.toString(16)).join('-');
  const plain = points
    .filter((c) => c.codePointAt(0) !== 0xfe0f)
    .map((c) => c.codePointAt(0)?.toString(16))
    .join('-');
  return codes.has(exact) ? exact : codes.has(plain) ? plain : null;
}
const markers = { bold: '**', italic: '*', spoiler: '||' } as const;
type MarkName = keyof typeof markers;
/** Closed, escaped inline Markdown; the API continues to store bounded plain text. */
export function commentInline(text: string): JSONContent[] {
  const nodes: JSONContent[] = [],
    marks: MarkName[] = [];
  let run = '';
  function flush() {
    if (!run) return;
    const current = marks.map((type) => ({ type }));
    for (const { segment } of new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(run)) {
      if (segment === '\n') nodes.push({ type: 'hardBreak', marks: current });
      else if (emojiCode(segment))
        nodes.push({ type: 'commentEmoji', attrs: { text: segment }, marks: current });
      else {
        const last = nodes.at(-1);
        if (last?.type === 'text' && JSON.stringify(last.marks) === JSON.stringify(current))
          last.text = (last.text ?? '') + segment;
        else nodes.push({ type: 'text', text: segment, marks: current });
      }
    }
    run = '';
  }
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (char === '\\' && i + 1 < text.length && /[\\*|]/.test(text[i + 1] ?? '')) {
      run += text[i + 1];
      i += 2;
      continue;
    }
    const top = marks.at(-1);
    const closing = top ? markers[top] : null;
    if (closing && text.startsWith(closing, i)) {
      flush();
      marks.pop();
      i += closing.length;
      continue;
    }
    const kind: MarkName | null = text.startsWith('||', i)
      ? 'spoiler'
      : text.startsWith('**', i)
        ? 'bold'
        : char === '*'
          ? 'italic'
          : null;
    if (
      kind &&
      !marks.includes(kind) &&
      marks.length < 3 &&
      text.indexOf(markers[kind], i + markers[kind].length) >= 0
    ) {
      flush();
      marks.push(kind);
      i += markers[kind].length;
      continue;
    }
    run += char;
    i++;
  }
  flush();
  return nodes;
}
export function commentDocument(text: string): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: commentInline(text) }],
  };
}
export function commentMarkdown(document: JSONContent): string {
  function inline(node: JSONContent): string {
    const text =
      node.type === 'commentEmoji' && typeof node.attrs?.['text'] === 'string'
        ? node.attrs['text']
        : node.type === 'hardBreak'
          ? '\n'
          : (node.text ?? '');
    if (node.type !== 'text' && node.type !== 'commentEmoji' && node.type !== 'hardBreak')
      return (node.content ?? []).map(inline).join('');
    let result = text.replace(/[\\*|]/g, '\\$&');
    for (const kind of ['italic', 'bold', 'spoiler'] as const)
      if (node.marks?.some((m) => m.type === kind)) result = markers[kind] + result + markers[kind];
    return result;
  }
  return (document.content ?? []).map(inline).join('\n');
}
