import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findMatches } from './find.js';
export const searchKey = new PluginKey<string>('manuscriptSearch');
/** View decorations never enter the stored manuscript or revision history. */
export const SelectionHighlights = Extension.create({
  name: 'manuscriptHighlights',
  addProseMirrorPlugins() {
    return [
      new Plugin<string>({
        key: searchKey,
        state: {
          init: () => '',
          apply: (tr, query) => (tr.getMeta(searchKey) as string | undefined) ?? query,
        },
        props: {
          decorations(state) {
            const { from, to } = state.selection;
            const decorations = findMatches(state.doc, searchKey.getState(state) ?? '', false).map(
              (m) => Decoration.inline(m.from, m.to, { class: 'writing-search-match' }),
            );
            if (from !== to)
              decorations.push(Decoration.inline(from, to, { class: 'writing-selection' }));
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
