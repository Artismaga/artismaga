import { Fragment, type ReactNode } from 'react';
import type { JSONContent } from '@tiptap/react';
import { commentDocument, emojiCode } from './document.js';
import { useI18n } from '../../localisation/index.js';
/** The same closed formatting vocabulary is used by the editor and escaped SSR. */
export function CommentBody({ text }: { text: string }) {
  function inline(node: JSONContent, key: number): ReactNode {
    let value: ReactNode = node.type === 'hardBreak' ? '\n' : (node.text ?? '');
    const source = node.attrs?.['text'];
    const code = typeof source === 'string' ? emojiCode(source) : null;
    if (node.type === 'commentEmoji' && code)
      value = (
        <img
          className="comment-emoji"
          src={`/assets/reactions/${code}.png`}
          alt={String(source)}
          width={22}
          height={22}
        />
      );
    for (const mark of [...(node.marks ?? [])].reverse()) {
      if (mark.type === 'bold') value = <strong>{value}</strong>;
      if (mark.type === 'italic') value = <em>{value}</em>;
    }
    return <Fragment key={key}>{value}</Fragment>;
  }
  function paragraph(nodes: JSONContent[]): ReactNode[] {
    const result: ReactNode[] = [];
    for (let i = 0; i < nodes.length;) {
      const node = nodes[i];
      if (!node) break;
      if (!node.marks?.some((mark) => mark.type === 'spoiler')) {
        result.push(inline(node, i));
        i++;
        continue;
      }
      const children: ReactNode[] = [];
      const key = i;
      while (i < nodes.length && nodes[i]?.marks?.some((mark) => mark.type === 'spoiler')) {
        children.push(inline(nodes[i]!, i));
        i++;
      }
      result.push(
        <details key={key} className="comment-spoiler">
          <summary>
            <SpoilerLabel />
          </summary>
          {children}
        </details>,
      );
    }
    return result;
  }
  return (
    <>
      {commentDocument(text).content?.map((node, i) => (
        <Fragment key={i}>
          {i > 0 ? '\n' : null}
          {paragraph(node.content ?? [])}
        </Fragment>
      ))}
    </>
  );
}
function SpoilerLabel() {
  return <>{useI18n().t('comments.spoiler')}</>;
}
