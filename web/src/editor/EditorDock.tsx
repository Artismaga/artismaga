import { Tooltip } from '@mantine/core';
import type { Dispatch, SetStateAction } from 'react';
import type { Editor } from '@tiptap/react';
import { Button, Group, NativeSelect, Text, TextInput } from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconSearch,
  IconReplace,
  IconChecklist,
  IconNote,
  IconX,
  IconBold,
} from '@tabler/icons-react';
import { useI18n } from '../localisation/index.js';
import { findMatches } from './find.js';
export interface FormattingAction {
  label: string;
  Icon: typeof IconBold;
  active: boolean | undefined;
  run: () => unknown;
}
export function EditorDock({
  editor,
  canEdit,
  controls,
  words,
  search,
  setSearch,
  query,
  setQuery,
  onReplace,
  onChecks,
  onChapterNote,
}: {
  editor: Editor | null;
  canEdit: boolean;
  controls: FormattingAction[];
  words: number;
  search: boolean;
  setSearch: Dispatch<SetStateAction<boolean>>;
  query: string;
  setQuery: (query: string) => void;
  onReplace: () => void;
  onChecks: () => void;
  onChapterNote: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="writing-toolbar writing-dock" role="toolbar" aria-label={t('editor.toolbar')}>
      <NativeSelect
        aria-label={t('editor.paragraph_style')}
        w={150}
        size="sm"
        value={
          editor?.isActive('heading', { level: 2 })
            ? '2'
            : editor?.isActive('heading', { level: 3 })
              ? '3'
              : editor?.isActive('heading', { level: 4 })
                ? '4'
                : 'p'
        }
        data={[
          { value: 'p', label: t('editor.paragraph') },
          ...[2, 3, 4].map((level) => ({
            value: String(level),
            label: t('editor.heading', { level: level - 1 }),
          })),
        ]}
        disabled={!editor || !canEdit}
        onChange={(e) => {
          const v = e.currentTarget.value;
          if (v === 'p') editor?.chain().focus().setParagraph().run();
          else
            editor
              ?.chain()
              .focus()
              .setHeading({ level: Number(v) as 2 | 3 | 4 })
              .run();
        }}
      />
      {controls.map(({ label, Icon, active, run }) => (
        <Tooltip label={label} key={label}>
          <span>
            <Button
              size="compact-sm"
              variant={active ? 'light' : 'subtle'}
              aria-pressed={active ?? false}
              aria-label={label}

              disabled={!editor || !canEdit}
              onClick={() => void run()}
            >
              <Icon size={19} />
            </Button>
          </span>
        </Tooltip>
      ))}
      <Tooltip label={t('editor.undo')}>
        <span>
          <Button
            size="compact-sm"
            variant="subtle"
            aria-label={t('editor.undo')}

            disabled={!editor || !canEdit || !editor.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <IconArrowBackUp size={19} />
          </Button>
        </span>
      </Tooltip>
      <Tooltip label={t('editor.redo')}>
        <span>
          <Button
            size="compact-sm"
            variant="subtle"
            aria-label={t('editor.redo')}

            disabled={!editor || !canEdit || !editor.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <IconArrowForwardUp size={19} />
          </Button>
        </span>
      </Tooltip>
      <Tooltip label={t('editor.search')}>
        <span>
          <Button
            size="compact-sm"
            variant="subtle"
            aria-label={t('editor.search')}

            disabled={!editor}
            onClick={() => setSearch((v) => !v)}
          >
            <IconSearch size={19} />
          </Button>
        </span>
      </Tooltip>
      <Tooltip label={t('editor.replace')}>
        <span>
          <Button
            size="compact-sm"
            variant="subtle"
            aria-label={t('editor.replace')}

            disabled={!editor}
            onClick={onReplace}
          >
            <IconReplace size={19} />
          </Button>
        </span>
      </Tooltip>
      <Tooltip label={t('editor.checks.title')}>
        <Button
          size="compact-sm"
          variant="subtle"
          aria-label={t('editor.checks.title')}

          onClick={onChecks}
        >
          <IconChecklist size={19} />
        </Button>
      </Tooltip>
      <Button
        className="mobile-chapter-note"
        size="compact-sm"
        variant="subtle"
        aria-label={t('editor.notes.chapter')}
        onClick={onChapterNote}
      >
        <IconNote size={19} />
      </Button>
      <Text size="xs" className="writing-word-count">
        {t('editor.words', { count: words })}
      </Text>
      {search && (
        <Group className="writing-search" gap="xs">
          <TextInput
            autoFocus
            aria-label={t('editor.search')}
            placeholder={t('editor.search')}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearch(false);
              if (e.key === 'Enter' && editor) {
                const matches = findMatches(editor.state.doc, query, false);
                const next =
                  matches.find((m) => m.from > editor.state.selection.from) ?? matches[0];
                if (next) editor.chain().setTextSelection(next).scrollIntoView().run();
              }
            }}
          />
          <Text size="xs">
            {t('editor.find.count', {
              count: editor ? findMatches(editor.state.doc, query, false).length : 0,
            })}
          </Text>
          <Button
            variant="subtle"
            size="compact-sm"
            aria-label={t('editor.search.close')}
            onClick={() => setSearch(false)}
          >
            <IconX size={16} />
          </Button>
        </Group>
      )}
    </div>
  );
}
