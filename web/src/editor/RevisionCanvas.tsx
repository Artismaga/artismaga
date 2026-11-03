import { useMemo } from 'react';
import { Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconRestore } from '@tabler/icons-react';
import type { Draft } from '../shared/writing.js';
import { useI18n } from '../localisation/index.js';
import { RichDocument } from './document.js';
import { revisionHighlights } from './revision-diff.js';
/** A reading-only writing surface: no editor commands, autosave or editable DOM. */
export function RevisionCanvas({
  before,
  after,
  onBack,
  onRestore,
  canEdit,
  busy,
}: {
  before: Draft;
  after: Draft;
  onBack: () => void;
  onRestore: (revision: number) => void;
  canEdit: boolean;
  busy: boolean;
}) {
  const { t, date } = useI18n();
  const highlights = useMemo(
    () => revisionHighlights(before.value.document, after.value.document),
    [before, after],
  );
  return (
    <Stack className="revision-workspace" gap="lg">
      <Group justify="space-between" className="revision-navigation">
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={17} />}
          onClick={onBack}
          disabled={busy}
        >
          {t('editor.history.back')}
        </Button>
        <Group gap="sm">
          <Badge variant="light">{t('editor.history.read_only')}</Badge>
          <Text size="sm" className="revision-added-key">
            {t('editor.history.additions')}
          </Text>
          <Text size="sm" className="revision-removed-key">
            {t('editor.history.removals')}
          </Text>
        </Group>
      </Group>
      {!highlights && (
        <Text c="dimmed" size="sm">
          {t('editor.history.large_diff')}
        </Text>
      )}
      <div className="revision-canvases">
        {(
          [
            { draft: before, side: 'before' },
            { draft: after, side: 'after' },
          ] as const
        ).map(({ draft, side }) => (
          <section key={side} aria-label={t(`editor.history.${side}`)} className="revision-pane">
            <Group justify="space-between" align="start" mb="md">
              <div>
                <Title order={2} size="h3">
                  {t('editor.history.version', { revision: draft.revision })}
                </Title>
                <Text c="dimmed" size="sm">
                  {date(draft.updated_at, 'datetime')} ·{' '}
                  {draft.author_name || t('editor.history.deleted_author')}
                </Text>
              </div>
              <Button
                variant="light"
                size="sm"
                leftSection={<IconRestore size={16} />}
                disabled={!canEdit || busy}
                onClick={() => onRestore(draft.revision)}
              >
                {t('editor.history.restore_version', { revision: draft.revision })}
              </Button>
            </Group>
            <Card
              p={0}
              className="writing-sheet revision-manuscript"
              aria-label={t('editor.manuscript')}
            >
              <RichDocument document={draft.value.document} highlights={highlights?.[side] ?? []} />
            </Card>
            <Stack mt="md" gap="xs">
              <Text c="dimmed" size="sm">
                {t('editor.language')}: {draft.value.language}
              </Text>
              {draft.value.chapter_note && (
                <Card className="revision-note">
                  <Title order={3} size="h5">
                    {t('editor.notes.chapter')}
                  </Title>
                  <Text size="sm">{draft.value.chapter_note}</Text>
                </Card>
              )}
              {draft.value.notes.map((note) => (
                <Card className="revision-note" key={note.uid}>
                  <Text size="xs" c="dimmed">
                    {note.anchor?.quote}
                  </Text>
                  <Text size="sm">{note.text}</Text>
                </Card>
              ))}
            </Stack>
          </section>
        ))}
      </div>
      <Text c="dimmed" size="sm">
        {t('editor.history.restore_help')}
      </Text>
    </Stack>
  );
}
