import { Extension, Mark, Node, markInputRule } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Plugin } from '@tiptap/pm/state';
import { Fragment } from '@tiptap/pm/model';
import { commentMarkdown, emojiCode } from './document.js';
const Spoiler = Mark.create({
  name: 'spoiler',
  parseHTML: () => [{ tag: 'span[data-comment-spoiler]' }],
  renderHTML: () => ['span', { 'data-comment-spoiler': '', class: 'comment-editor-spoiler' }, 0],
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(\|\|([^|]+)\|\|)$/, type: this.type })];
  },
});
const Emoji = Node.create({
  name: 'commentEmoji',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return { text: { default: '' } };
  },
  // Only generated JSON nodes can supply an image; pasted images are never parsed.
  parseHTML: () => [],
  renderHTML({ node }) {
    const text = typeof node.attrs['text'] === 'string' ? node.attrs['text'] : '';
    const code = emojiCode(text);
    return code
      ? [
          'img',
          {
            src: `/assets/reactions/${code}.png`,
            alt: text,
            class: 'comment-emoji',
            width: 22,
            height: 22,
          },
        ]
      : ['span', {}, text];
  },
  renderText({ node }) {
    return String(node.attrs['text'] ?? '');
  },
});
export function commentExtensions(onLimit: () => void) {
  return [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      link: false,
      horizontalRule: false,
      trailingNode: false,
    }),
    Spoiler,
    Emoji,
    Extension.create({
      name: 'commentSafety',
      addProseMirrorPlugins() {
        return [
          new Plugin({
            filterTransaction(transaction) {
              if (!transaction.docChanged) return true;
              const body = commentMarkdown(transaction.doc.toJSON());
              if (Array.from(body).length <= 4000 && new TextEncoder().encode(body).length <= 16000)
                return true;
              onLimit();
              return false;
            },
            appendTransaction(transactions, _old, state) {
              if (!transactions.some((t) => t.docChanged)) return null;
              const replacements: { from: number; to: number; content: Fragment }[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return;
                const parts = [];
                let found = false;
                for (const { segment } of new Intl.Segmenter('en', {
                  granularity: 'grapheme',
                }).segment(node.text)) {
                  const type = state.schema.nodes['commentEmoji'];
                  if (type && emojiCode(segment)) {
                    parts.push(type.create({ text: segment }, null, node.marks));
                    found = true;
                  } else parts.push(state.schema.text(segment, node.marks));
                }
                if (found)
                  replacements.push({
                    from: pos,
                    to: pos + node.nodeSize,
                    content: Fragment.fromArray(parts),
                  });
              });
              if (!replacements.length) return null;
              const transaction = state.tr;
              for (const replacement of replacements.reverse())
                transaction.replaceWith(replacement.from, replacement.to, replacement.content);
              return transaction;
            },
          }),
        ];
      },
    }),
  ];
}
