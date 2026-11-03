import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { Highlight } from './revision-diff.js';
import type { RichNode } from '../shared/writing.js';
import { safeLink } from '../shared/writing.js';
/** Safe SSR rendering uses a closed element vocabulary, never stored HTML. */
export function RichDocument({
  document,
  highlights = [],
}: {
  document: RichNode;
  highlights?: Highlight[];
}) {
  return (
    <div className="chapter-prose">{renderNode(document, { offset: 0, range: 0 }, highlights)}</div>
  );
}
function renderNode(
  node: RichNode,
  cursor: { offset: number; range: number },
  highlights: Highlight[],
): ReactNode {
  let text: ReactNode = node.text ?? '';
  if (node.type === 'text') {
    const source = node.text ?? '',
      start = cursor.offset,
      end = start + source.length;
    const parts: ReactNode[] = [];
    let at = start;
    while (cursor.range < highlights.length && highlights[cursor.range]!.to <= start)
      cursor.range++;
    for (let i = cursor.range; i < highlights.length; i++) {
      const highlight = highlights[i]!;
      if (highlight.from >= end) break;
      const from = Math.max(start, highlight.from),
        to = Math.min(end, highlight.to);
      if (from > at) parts.push(source.slice(at - start, from - start));
      if (to > from)
        parts.push(
          highlight.kind === 'added' ? (
            <ins key={i}>{source.slice(from - start, to - start)}</ins>
          ) : (
            <del key={i}>{source.slice(from - start, to - start)}</del>
          ),
        );
      at = Math.max(at, to);
    }
    if (at < end) parts.push(source.slice(at - start));
    text = parts;
    cursor.offset = end;
  } else if (node.type === 'hardBreak' || node.type === 'horizontalRule')
    cursor.offset += plainText(node).length;
  const children = node.content?.map((n, i) => (
    <Fragment key={i}>{renderNode(n, cursor, highlights)}</Fragment>
  ));
  if (['paragraph', 'heading', 'blockquote', 'listItem'].includes(node.type)) cursor.offset++;
  switch (node.type) {
    case 'doc':
      return children;
    case 'text':
      return (node.marks ?? []).reduce<ReactNode>(
        (text, mark) =>
          mark.type === 'bold' ? (
            <strong>{text}</strong>
          ) : mark.type === 'italic' ? (
            <em>{text}</em>
          ) : mark.type === 'link' &&
            typeof mark.attrs?.['href'] === 'string' &&
            safeLink(mark.attrs['href']) ? (
            <a href={mark.attrs['href']} rel="noopener noreferrer">
              {text}
            </a>
          ) : (
            text
          ),
        text,
      );
    case 'paragraph':
      return <p>{children ?? <br />}</p>;
    case 'heading':
      return node.attrs?.['level'] === 2 ? (
        <h2>{children}</h2>
      ) : node.attrs?.['level'] === 3 ? (
        <h3>{children}</h3>
      ) : (
        <h4>{children}</h4>
      );
    case 'blockquote':
      return <blockquote>{children}</blockquote>;
    case 'bulletList':
      return <ul>{children}</ul>;
    case 'orderedList':
      return (
        <ol start={typeof node.attrs?.['start'] === 'number' ? node.attrs['start'] : 1}>
          {children}
        </ol>
      );
    case 'listItem':
      return <li>{children}</li>;
    case 'hardBreak':
      return <br />;
    case 'horizontalRule':
      return <hr />;
    default:
      return null;
  }
}
export function plainText(node: RichNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'horizontalRule') return '\n* * *\n';
  const text = (node.content ?? []).map(plainText).join('');
  return ['paragraph', 'heading', 'blockquote', 'listItem'].includes(node.type)
    ? text + '\n'
    : text;
}
export function wordCount(document: RichNode, language: string): number {
  const text = plainText(document);
  return [...new Intl.Segmenter(language, { granularity: 'word' }).segment(text)].filter(
    (s) => s.isWordLike,
  ).length;
}
