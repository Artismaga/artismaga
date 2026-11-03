import { useEffect, useRef, useState } from 'react';
import { Button, Group, Modal, Stack, Text, Textarea, Title } from '@mantine/core';
import type { Editor } from '@tiptap/react';
import { useI18n } from '../localisation/index.js';
import type { AuthorNote } from '../shared/writing.js';
export function ChapterNote({
  value,
  canEdit,
  onChange,
}: {
  value: string;
  canEdit: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Stack gap="sm">
      <Title order={2} size="h4">
        {t('editor.notes.chapter')}
      </Title>
      <Textarea
        aria-label={t('editor.notes.chapter')}
        placeholder={t('editor.notes.outline')}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        readOnly={!canEdit}
        autosize
        minRows={12}
      />
    </Stack>
  );
}
export function PassageNotes({
  notes,
  editor,
  onOpen,
}: {
  notes: AuthorNote[];
  editor: Editor | null;
  onOpen: (note: AuthorNote) => void;
}) {
  const { t } = useI18n();
  const rail = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!editor || !rail.current) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!rail.current || editor.isDestroyed) return;
        const origin = rail.current.getBoundingClientRect().top;
        let bottom = 0;
        const next: Record<string, number> = {};
        const sorted = [...notes].sort(
          (a, b) => (a.anchor?.from ?? Infinity) - (b.anchor?.from ?? Infinity),
        );
        for (const note of sorted) {
          const anchor = note.anchor;
          let top = bottom;
          if (anchor && !anchor.detached)
            top = Math.max(
              bottom,
              editor.view.coordsAtPos(Math.min(anchor.from, editor.state.doc.content.size)).top -
                origin,
            );
          next[note.uid] = Math.max(0, top);
          const item = [...rail.current.children].find(
            (el) => (el as HTMLElement).dataset['note'] === note.uid,
          );
          bottom = Math.max(0, top) + (item?.getBoundingClientRect().height ?? 90) + 12;
        }
        setPositions(next);
      });
    };
    editor.on('transaction', measure);
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(editor.view.dom);
    observer.observe(rail.current);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      editor.off('transaction', measure);
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [editor, notes]);
  return (
    <aside
      className="passage-notes"
      ref={rail}
      aria-label={t('editor.notes.passage')}
      style={{ minHeight: Math.max(0, ...Object.values(positions)) + 120 }}
    >
      {notes.map((note, index) => (
        <button
          type="button"
          className="passage-note"
          data-note={note.uid}
          key={note.uid}
          style={{ top: positions[note.uid] ?? 0 }}
          onClick={() => onOpen(note)}
          aria-label={t('editor.notes.open', { number: index + 1 })}
        >
          <span className="passage-note-number">{index + 1}</span>
          <span className="passage-note-body">
            <Text component="span" size="xs" c="dimmed" lineClamp={2}>
              {note.anchor?.detached ? t('editor.notes.detached') : note.anchor?.quote}
            </Text>
            <Text component="span" size="sm" lineClamp={4}>
              {note.text}
            </Text>
          </span>
        </button>
      ))}
    </aside>
  );
}
export function PassageNoteDialog({
  note,
  canEdit,
  onClose,
  onSave,
  onRemove,
}: {
  note: AuthorNote | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (note: AuthorNote) => void;
  onRemove: (uid: string) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  useEffect(() => {
    setText(note?.text ?? '');
  }, [note]);
  return (
    <Modal opened={!!note} onClose={onClose} title={t('editor.notes.passage')}>
      <Stack>
        <Text c="dimmed" size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {note?.anchor?.quote}
        </Text>
        <Textarea
          autoFocus
          label={t('editor.notes.text')}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          readOnly={!canEdit}
          maxLength={4000}
          minRows={5}
          autosize
        />
        <Group justify="space-between">
          <Button
            disabled={!canEdit || !text.trim()}
            onClick={() => {
              if (note) onSave({ ...note, text: text.trim() });
            }}
          >
            {t('editor.save')}
          </Button>
          <Button
            variant="subtle"
            color="red"
            disabled={!canEdit}
            onClick={() => {
              if (note) onRemove(note.uid);
            }}
          >
            {t('editor.notes.remove')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
