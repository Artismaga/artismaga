import { useFeedback } from '../components/Feedback.js';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { diffWordsWithSpace } from 'diff';
import {
  Button,
  Group,
  Modal,
  Avatar,
  Table,
  UnstyledButton,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { draftSchema, historySchema } from '../shared/writing.js';
import type { Draft, History, Manuscript } from '../shared/writing.js';
import { useI18n } from '../localisation/index.js';
import { RevisionCanvas } from './RevisionCanvas.js';
import { RichDocument, plainText } from './document.js';
export function RevisionComparison({ before, after }: { before: Manuscript; after: Manuscript }) {
  const { t } = useI18n();
  const changes = diffWordsWithSpace(plainText(before.document), plainText(after.document), {
    timeout: 60,
    maxEditLength: 10000,
  });
  return (
    <Stack>
      <Title order={3}>{t('editor.history.text_changes')}</Title>
      <div className="revision-diff">
        {changes ? (
          changes.map((c, i) =>
            c.added ? (
              <ins key={i}>{c.value}</ins>
            ) : c.removed ? (
              <del key={i}>{c.value}</del>
            ) : (
              <span key={i}>{c.value}</span>
            ),
          )
        ) : (
          <Text>{t('editor.history.large_diff')}</Text>
        )}
      </div>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <section>
          <Title order={3}>{t('editor.history.before')}</Title>
          <Text size="sm" c="dimmed">
            {t('editor.language')}: {before.language}
          </Text>
          <RichDocument document={before.document} />
          <Text className="revision-note">{before.chapter_note}</Text>
          {before.notes.length > 0 && <Title order={4}>{t('editor.notes.title')}</Title>}
          {before.notes.map((n) => (
            <Text size="sm" key={n.uid} className="revision-note">
              {n.anchor && (
                <span>
                  {n.anchor.quote}
                  <br />
                </span>
              )}
              {n.text}
            </Text>
          ))}
        </section>
        <section>
          <Title order={3}>{t('editor.history.after')}</Title>
          <Text size="sm" c="dimmed">
            {t('editor.language')}: {after.language}
          </Text>
          <RichDocument document={after.document} />
          <Text className="revision-note">{after.chapter_note}</Text>
          {after.notes.length > 0 && <Title order={4}>{t('editor.notes.title')}</Title>}
          {after.notes.map((n) => (
            <Text size="sm" key={n.uid} className="revision-note">
              {n.anchor && (
                <span>
                  {n.anchor.quote}
                  <br />
                </span>
              )}
              {n.text}
            </Text>
          ))}
        </section>
      </SimpleGrid>
    </Stack>
  );
}
export function RevisionHistory({
  opened,
  onClose,
  endpoint,
  canEdit,
  onRestore,
}: {
  opened: boolean;
  onClose: () => void;
  endpoint: string;
  canEdit: boolean;
  onRestore: (revision: number) => Promise<void>;
}) {
  const { t, date } = useI18n();
  const [history, setHistory] = useState<History>({
    revisions: [],
    has_more: false,
    next_before: 0,
  });
  const [first, setFirst] = useState<number | null>(null);
  const [pair, setPair] = useState<{ before: Draft; after: Draft } | null>(null);
  const [, setError] = useFeedback('error');
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!opened) {
      request.current?.abort();
      return;
    }
    setFirst(null);
    setPair(null);
    setHistory({ revisions: [], has_more: false, next_before: 0 });
    void load();
    return () => request.current?.abort();
  }, [opened, endpoint]);
  async function load(append = false) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        endpoint + '/history' + (append ? `?before=${history.next_before}` : ''),
        { signal: controller.signal },
      );
      if (!response.ok) throw Error();
      const next = z.object({ history: historySchema }).parse(await response.json()).history;
      if (!controller.signal.aborted)
        setHistory((previous) => ({
          ...next,
          revisions: append ? [...previous.revisions, ...next.revisions] : next.revisions,
        }));
    } catch {
      if (!controller.signal.aborted) setError('editor.history.error');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function select(revision: number) {
    if (busy) return;
    if (first === null) {
      setFirst(revision);
      return;
    }
    if (first === revision) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    try {
      const snapshots = await Promise.all(
        [first, revision]
          .sort((a, b) => a - b)
          .map(async (number) => {
            const response = await fetch(`${endpoint}/history/${number}`, {
              signal: controller.signal,
            });
            if (!response.ok) throw Error();
            return z.object({ draft: draftSchema }).parse(await response.json()).draft;
          }),
      );
      const [before, after] = snapshots;
      if (!before || !after) throw Error();
      if (!controller.signal.aborted) setPair({ before, after });
    } catch {
      if (!controller.signal.aborted) setError('editor.history.error');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  function restore(revision: number) {
    setBusy(true);
    setError('');
    void onRestore(revision)
      .catch(() => setError('editor.error.restore'))
      .finally(() => setBusy(false));
  }
  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (pair) {
          if (!busy) setPair(null);
        } else onClose();
      }}
      title={t(pair ? 'editor.history.compare_title' : 'editor.history.title')}
      size="xl"
      fullScreen={pair !== null}
      radius={pair ? 0 : 'lg'}
      className={pair ? 'revision-comparison-modal' : undefined}
      closeOnEscape={!pair || !busy}
      closeOnClickOutside={!pair || !busy}
      withCloseButton={!pair || !busy}
    >
      {pair ? (
        <>
          <RevisionCanvas
            before={pair.before}
            after={pair.after}
            onBack={() => setPair(null)}
            onRestore={restore}
            canEdit={canEdit}
            busy={busy}
          />
        </>
      ) : (
        <Stack>
          <Text c="dimmed" size="sm" role="status" aria-live="polite">
            {first === null
              ? t('editor.history.select_first')
              : t('editor.history.select_second', { revision: first })}
          </Text>
          {first !== null && (
            <Button size="xs" variant="subtle" onClick={() => setFirst(null)} disabled={busy}>
              {t('editor.history.reset')}
            </Button>
          )}

          <Table.ScrollContainer minWidth={450}>
            <Table
              highlightOnHover
              className="revision-table"
              aria-label={t('editor.history.title')}
              aria-busy={busy}
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('editor.history.number')}</Table.Th>
                  <Table.Th>{t('editor.history.date')}</Table.Th>
                  <Table.Th>{t('editor.history.editor')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {history.revisions.map((revision) => (
                  <Table.Tr
                    key={revision.revision}
                    data-selected={first === revision.revision || undefined}
                    onClick={() => void select(revision.revision)}
                  >
                    <Table.Td>
                      <UnstyledButton
                        className="revision-select"
                        disabled={busy || first === revision.revision}
                        aria-pressed={first === revision.revision}
                        aria-label={t('editor.history.select_version', {
                          revision: revision.revision,
                        })}
                        onClick={(event) => {
                          event.stopPropagation();
                          void select(revision.revision);
                        }}
                      >
                        #{revision.revision}
                      </UnstyledButton>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{date(revision.updated_at, 'datetime')}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <Avatar src={revision.avatar_url} size={30} radius="xl" alt="" />
                        <Text size="sm">
                          {revision.author_name || t('editor.history.deleted_author')}
                        </Text>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {!busy && !history.revisions.length && (
            <Text c="dimmed">{t('editor.history.empty')}</Text>
          )}
          {busy && (
            <Text size="sm" role="status">
              {t('editor.history.loading')}
            </Text>
          )}

          {history.has_more && (
            <Button variant="light" loading={busy} onClick={() => void load(true)}>
              {t('editor.history.more')}
            </Button>
          )}
        </Stack>
      )}
    </Modal>
  );
}
