import { useState } from 'react';
import { Button, Checkbox, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import type { Editor } from '@tiptap/react';
import { useI18n } from '../localisation/index.js';
import { findMatches } from './find.js';
export function FindReplace({
  editor,
  opened,
  onClose,
  canEdit,
}: {
  editor: Editor | null;
  opened: boolean;
  onClose: () => void;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [index, setIndex] = useState(0);
  const matches = editor ? findMatches(editor.state.doc, query, caseSensitive) : [];
  function next() {
    const match = matches[index % matches.length];
    if (match && editor) {
      editor.chain().setTextSelection(match).scrollIntoView().run();
      setIndex((index + 1) % matches.length);
    }
  }
  return (
    <Modal opened={opened} onClose={onClose} title={t('editor.find.title')}>
      <Stack>
        <TextInput
          label={t('editor.find.query')}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setIndex(0);
          }}
          maxLength={500}
        />
        <TextInput
          label={t('editor.find.replacement')}
          value={replacement}
          onChange={(e) => setReplacement(e.currentTarget.value)}
          maxLength={2000}
          disabled={!canEdit}
        />
        <Checkbox
          label={t('editor.find.case')}
          checked={caseSensitive}
          onChange={(e) => setCaseSensitive(e.currentTarget.checked)}
        />
        <Text size="sm" role="status">
          {t('editor.find.count', { count: matches.length })}
        </Text>
        <Group>
          <Button variant="light" disabled={!matches.length} onClick={next}>
            {t('editor.find.next')}
          </Button>
          <Button
            disabled={!canEdit || !matches.length}
            onClick={() => {
              const match = matches[index % matches.length];
              if (match && editor)
                editor.view.dispatch(editor.state.tr.insertText(replacement, match.from, match.to));
            }}
          >
            {t('editor.find.replace')}
          </Button>
          <Button
            variant="light"
            disabled={!canEdit || !matches.length}
            onClick={() => {
              if (!editor) return;
              let tr = editor.state.tr;
              for (const match of [...matches].reverse())
                tr = tr.insertText(replacement, match.from, match.to);
              editor.view.dispatch(tr);
            }}
          >
            {t('editor.find.all')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
