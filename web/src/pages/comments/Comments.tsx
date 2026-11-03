import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Modal,
  NativeSelect,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconShield,
  IconFlag,
  IconUserOff,
  IconVolumeOff,
  IconEdit,
  IconTrash,
  IconHeart,
  IconMessage,
} from '@tabler/icons-react';
import { discussionSchema, type Comment } from '../../shared/community.js';
import { postJson } from '../../client/api.js';
import { useI18n } from '../../localisation/index.js';
import { Composer } from './Composer.js';
import { CommentBody } from './Body.js';
export function orderComments(
  comments: Comment[],
  mode: string,
): { comment: Comment; depth: number }[] {
  const siblings = new Map<string, Comment[]>();
  const ids = new Set(comments.map((c) => c.uid));
  for (const comment of comments) {
    const parent = comment.parent && ids.has(comment.parent) ? comment.parent : '';
    const rows = siblings.get(parent) ?? [];
    rows.push(comment);
    siblings.set(parent, rows);
  }
  for (const rows of siblings.values())
    rows.sort(
      (a, b) =>
        (mode === 'hot' ? b.likes - a.likes : 0) ||
        (mode === 'oldest' ? a.created_at - b.created_at : b.created_at - a.created_at) ||
        a.uid.localeCompare(b.uid),
    );
  const result: { comment: Comment; depth: number }[] = [],
    visited = new Set<string>();
  const stack = (siblings.get('') ?? [])
    .slice()
    .reverse()
    .map((comment) => ({ comment, depth: 0 }));
  while (stack.length) {
    const row = stack.pop();
    if (!row || visited.has(row.comment.uid)) continue;
    visited.add(row.comment.uid);
    result.push(row);
    for (const child of (siblings.get(row.comment.uid) ?? []).slice().reverse())
      stack.push({ comment: child, depth: row.depth + 1 });
  }
  return result;
}
export function Comments({ work, chapter }: { work: string; chapter: string }) {
  const { t, date } = useI18n();
  const [data, setData] = useState<ReturnType<typeof discussionSchema.parse> | null>(null),
    [sort, setSort] = useState('hot'),
    [error, setError] = useState(''),
    [editing, setEditing] = useState<string | null>(null),
    [reply, setReply] = useState<string | null>(null),
    [deleting, setDeleting] = useState<Comment | null>(null),
    [busy, setBusy] = useState(false);
  const endpoint = `/api/comments/${work}/${chapter}`;
  async function load() {
    const r = await fetch(endpoint, { cache: 'no-store' });
    if (!r.ok) throw Error();
    setData(discussionSchema.parse(await r.json()));
    if (window.location.hash.startsWith('#comment-'))
      requestAnimationFrame(() =>
        document
          .getElementById(decodeURIComponent(window.location.hash.slice(1)))
          ?.scrollIntoView(),
      );
  }
  useEffect(() => {
    try {
      const saved = localStorage.getItem('artismaga:comment-sort');
      if (saved && ['hot', 'new', 'oldest'].includes(saved)) setSort(saved);
    } catch {
      /* Optional. */
    }
    void load().catch(() => setError(t('comments.failed')));
  }, [endpoint]);
  async function command(
    action: string,
    row?: Comment,
    body = '',
    gif: string | null = null,
    parent: string | null = null,
  ) {
    await postJson(endpoint, {
      account: data?.account,
      command: { action, uid: row?.uid ?? '', revision: row?.revision ?? 0, body, gif, parent },
    });
    await load();
  }
  async function act(action: string, row: Comment) {
    setBusy(true);
    setError('');
    try {
      await command(action, row);
    } catch {
      setError(t('comments.failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="chapter-comments" aria-label={t('comments.title')}>
      <Stack>
        <Group justify="space-between">
          <Title order={2}>{t('comments.title')}</Title>
          <NativeSelect
            aria-label={t('comments.sort')}
            value={sort}
            data={['hot', 'new', 'oldest'].map((value) => ({
              value,
              label: t(`comments.sort.${value}`),
            }))}
            onChange={(e) => {
              setSort(e.currentTarget.value);
              try {
                localStorage.setItem('artismaga:comment-sort', e.currentTarget.value);
              } catch {
                /* Optional. */
              }
            }}
          />
        </Group>
        {data?.can_comment ? (
          <Composer onSend={(body, gif) => command('create', undefined, body, gif)} />
        ) : (
          <Text c="dimmed">{t('comments.sign_in')}</Text>
        )}
        {error && (
          <Text role="alert" c="red">
            {error}
          </Text>
        )}
        {data?.comments.length === 0 && <Text c="dimmed">{t('comments.empty')}</Text>}
        {data &&
          orderComments(data.comments, sort).map(({ comment: row, depth }) => {
            const muted = data.muted.includes(row.account);
            const own = row.account === data.account;
            return (
              <article
                id={`comment-${row.uid}`}
                key={row.uid}
                className="comment-row"
                style={{ marginInlineStart: `${Math.min(depth, 3) * 16}px` }}
              >
                <Group align="flex-start" wrap="nowrap">
                  <Avatar src={row.avatar || null} name={row.name} radius="xl" size={36} />
                  <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6}>
                      {row.manager && (
                        <Tooltip label={t('comments.administrator')}>
                          <Badge variant="light" size="sm" aria-label={t('comments.administrator')}>
                            <IconShield size={14} />
                          </Badge>
                        </Tooltip>
                      )}
                      <Text fw={600}>{row.name || t('comments.deleted_user')}</Text>
                      {row.author && <Badge size="sm">{t('comments.author')}</Badge>}
                      <Text size="xs" c="dimmed">
                        {date(row.created_at, 'date')}
                      </Text>
                    </Group>
                    {editing === row.uid ? (
                      <Composer
                        initial={row.body}
                        initialGif={row.gif}
                        onCancel={() => setEditing(null)}
                        onSend={async (body, gif) => {
                          await command('edit', row, body, gif);
                          setEditing(null);
                        }}
                      />
                    ) : row.deleted || muted ? (
                      <Text c="dimmed">{t(muted ? 'comments.muted' : 'comments.deleted')}</Text>
                    ) : (
                      <div className="comment-body">
                        <CommentBody text={row.body} />
                        {row.gif && (
                          <img
                            loading="lazy"
                            className="comment-gif"
                            src={`/api/comments/gifs/${row.gif}`}
                            alt={t('comments.gif')}
                          />
                        )}
                      </div>
                    )}
                    {!row.deleted && !muted && (
                      <Group gap={4}>
                        {(
                          [
                            [IconFlag, 'report', false, () => {}],
                            [IconUserOff, 'block', false, () => {}],
                            [
                              IconVolumeOff,
                              'mute',
                              !!data.account && !own,
                              () => void act('mute', row),
                            ],
                            [IconEdit, 'edit', own && data.can_comment, () => setEditing(row.uid)],
                            [IconTrash, 'delete', own || data.can_manage, () => setDeleting(row)],
                            [
                              IconMessage,
                              'reply',
                              data.can_comment,
                              () => setReply(reply === row.uid ? null : row.uid),
                            ],
                            [IconHeart, 'like', data.can_comment, () => void act('like', row)],
                          ] as const
                        )
                          .filter(
                            ([, key, enabled]) =>
                              enabled || key === 'report' || key === 'block' || key === 'like',
                          )
                          .map(([Icon, key, enabled, run]) => (
                            <Tooltip
                              key={key}
                              label={t(
                                key === 'report' || key === 'block'
                                  ? `comments.${key}_pending`
                                  : `comments.${key}`,
                              )}
                            >
                              <span>
                                <ActionIcon
                                  variant={key === 'like' && row.liked ? 'light' : 'subtle'}
                                  color={key === 'like' ? 'red' : 'gray'}
                                  aria-label={t(`comments.${key}`)}
                                  aria-pressed={key === 'like' ? row.liked : undefined}
                                  disabled={!enabled || busy}
                                  onClick={run}
                                >
                                  <Icon
                                    size={17}
                                    fill={key === 'like' && row.liked ? 'currentColor' : 'none'}
                                  />
                                </ActionIcon>
                              </span>
                            </Tooltip>
                          ))}
                        <Text size="xs" c="dimmed">
                          {row.likes}
                        </Text>
                      </Group>
                    )}
                    {reply === row.uid && data.can_comment && (
                      <Composer
                        onCancel={() => setReply(null)}
                        onSend={async (body, gif) => {
                          await command('create', undefined, body, gif, row.uid);
                          setReply(null);
                        }}
                      />
                    )}
                  </Stack>
                </Group>
              </article>
            );
          })}
      </Stack>
      <Modal
        opened={deleting !== null}
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
        title={t('comments.delete_title')}
      >
        <Stack>
          <Text>{t('comments.delete_confirm')}</Text>
          <Group justify="flex-end">
            <Button variant="default" disabled={busy} onClick={() => setDeleting(null)}>
              {t('comments.cancel')}
            </Button>
            <Button
              color="red"
              loading={busy}
              onClick={() => {
                if (!deleting) return;
                setBusy(true);
                void command('delete', deleting)
                  .then(() => setDeleting(null))
                  .catch(() => setError(t('comments.failed')))
                  .finally(() => setBusy(false));
              }}
            >
              {t('comments.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </section>
  );
}
