import { useFeedback } from '../../components/Feedback.js';
import { useState, useEffect } from 'react';
import { z } from 'zod';
import {
  Card,
  Stack,
  Group,
  Title,
  Text,
  Button,
  TextInput,
  Textarea,
  NativeSelect,
  Checkbox,
  TagsInput,
  Modal,
  Badge,
  Avatar,
} from '@mantine/core';
import { announcementSchema, announcementValueSchema } from '../../shared/announcements.js';
import type { Announcement, AnnouncementValue } from '../../shared/announcements.js';
import type { AssetRef } from '../../shared/studio.js';
import { ArtworkInput } from '../../components/ArtworkInput.js';
import { AnnouncementBanner } from '../../components/Announcements.js';
import { postJson, errorMessage } from '../../client/api.js';
import { useI18n } from '../../localisation/index.js';
const empty: AnnouncementValue = {
  kind: 'notice',
  severity: 'info',
  title: '',
  description: '',
  image: null,
  cta_text: '',
  cta_url: '',
  dismissible: true,
  starts_at: null,
  ends_at: null,
  audience: 'everyone',
  roles: [],
};
export function Announcements({
  initial,
  roles,
}: {
  initial: unknown[];
  roles: { key: string; name: string }[];
}) {
  const { tx, t, date, now } = useI18n();
  const [rows, setRows] = useState(() => z.array(announcementSchema).parse(initial).slice(0, 50));
  const [hasMore, setHasMore] = useState(initial.length > 50);
  const [nextOffset, setNextOffset] = useState(50);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [opened, setOpened] = useState(false);
  const [value, setValue] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [, setError] = useFeedback('error');
  const [search, setSearch] = useState('');
  async function load(offset = 0, signal?: AbortSignal) {
    const r = await fetch(
      `/api/admin/announcements?offset=${offset}&search=${encodeURIComponent(search)}`,
      { signal: signal ?? AbortSignal.timeout(10000) },
    );
    if (!r.ok) throw Error('Announcements unavailable');
    const data = z
      .object({
        announcements: z.array(announcementSchema),
        has_more: z.boolean(),
        next_offset: z.number(),
      })
      .parse(await r.json());
    if (signal?.aborted) return;
    setRows((previous) =>
      offset === 0
        ? data.announcements
        : [
            ...previous,
            ...data.announcements.filter((row) => !previous.some((old) => old.uid === row.uid)),
          ],
    );
    setHasMore(data.has_more);
    setNextOffset(data.next_offset);
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      void load(0, controller.signal)
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search]);
  const set = <K extends keyof AnnouncementValue>(key: K, next: AnnouncementValue[K]) =>
    setValue((old) => ({ ...old, [key]: next }));
  const status = (a: Announcement) =>
    a.cancelled
      ? tx('Cancelled')
      : a.value.ends_at !== null && a.value.ends_at <= now
        ? tx('Ended')
        : a.value.starts_at !== null && a.value.starts_at > now
          ? tx('Scheduled')
          : tx('Live');
  async function save(cancelled = false) {
    setBusy(true);
    setError('');
    try {
      await postJson('/api/admin/announcements', {
        uid: editing?.uid ?? null,
        revision: editing?.revision ?? 0,
        value: announcementValueSchema.parse(value),
        cancelled,
      });
      await load();
      setOpened(false);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const dateValue = (n: number | null) =>
    n === null
      ? ''
      : new Date(n * 1000 - new Date(n * 1000).getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>{tx('Announcements')}</Title>
          <Text c="dimmed">
            {tx(
              'Schedule notices and promotions. Past and cancelled announcements remain in this history.',
            )}
          </Text>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setValue({ ...empty });
            setOpened(true);
            setError('');
          }}
        >
          {tx('Create announcement')}
        </Button>
      </Group>
      <TextInput
        label={tx('Search announcements')}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
      />
      {rows
        .filter((a) =>
          `${a.value.title} ${a.value.description}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        )
        .map((a) => (
          <Card key={a.uid}>
            <Group justify="space-between">
              <div>
                <Group>
                  <Title order={3}>{a.value.title || tx('Image promotion')}</Title>
                  <Badge>{status(a)}</Badge>
                  <Badge variant="light">
                    {tx(a.value.kind === 'notice' ? 'Notification' : 'Promotion')}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed" lineClamp={2} mt="xs">
                  {a.value.description}
                </Text>
                <Group mt="sm" gap="xs">
                  <Avatar
                    size="sm"
                    src={a.initiator?.avatar_url ?? null}
                    name={a.initiator?.display_name ?? tx('Deleted account')}
                  />
                  <Text size="xs">
                    {a.initiator?.display_name ?? tx('Deleted account')} · {date(a.created_at)}
                  </Text>
                </Group>
              </div>
              <Button
                variant="light"
                onClick={() => {
                  setEditing(a);
                  setValue(a.value);
                  setOpened(true);
                  setError('');
                }}
              >
                {tx('Manage')}
              </Button>
            </Group>
          </Card>
        ))}
      {hasMore && (
        <Button
          variant="light"
          loading={loading}
          onClick={() => {
            setLoading(true);
            void load(nextOffset)
              .catch((e: unknown) => setError(errorMessage(e)))
              .finally(() => setLoading(false));
          }}
        >
          {t('announcements.load_more')}
        </Button>
      )}

      {!rows.length && (
        <Card>
          <Text c="dimmed">{tx('No announcements yet.')}</Text>
        </Card>
      )}
      <Modal
        opened={opened}
        onClose={() => !busy && setOpened(false)}
        title={tx(editing ? 'Manage announcement' : 'Create announcement')}
        size="xl"
      >
        <Stack>
          <Group grow>
            <NativeSelect
              label={tx('Type')}
              value={value.kind}
              onChange={(e) => set('kind', e.currentTarget.value as AnnouncementValue['kind'])}
              data={[
                { value: 'notice', label: tx('Notification') },
                { value: 'promotion', label: tx('Promotion') },
              ]}
            />
            {value.kind === 'notice' && (
              <NativeSelect
                label={tx('Severity')}
                value={value.severity}
                onChange={(e) =>
                  set('severity', e.currentTarget.value as AnnouncementValue['severity'])
                }
                data={['info', 'warning', 'critical'].map((v) => ({
                  value: v,
                  label: tx(
                    v === 'info' ? 'Informational' : v === 'warning' ? 'Warning' : 'Critical',
                  ),
                }))}
              />
            )}
          </Group>
          <TextInput
            required={value.kind === 'notice'}
            label={tx('Title')}
            value={value.title}
            maxLength={160}
            onChange={(e) => set('title', e.currentTarget.value)}
          />
          <Textarea
            label={tx('Description')}
            minRows={3}
            maxLength={2000}
            value={value.description}
            onChange={(e) => set('description', e.currentTarget.value)}
          />
          {value.kind === 'promotion' && (
            <>
              <ArtworkInput
                label={tx('Promotional image')}
                purpose="announcement"
                value={
                  value.image
                    ? { uid: value.image, url: `/media/${value.image}`, palette: [] }
                    : null
                }
                onChange={(a: AssetRef | null) => set('image', a?.uid ?? null)}
                onBusyChange={setUploading}
              />
              <Group grow>
                <TextInput
                  label={tx('CTA button text')}
                  maxLength={80}
                  value={value.cta_text}
                  onChange={(e) => set('cta_text', e.currentTarget.value)}
                />
                <TextInput
                  label={tx('CTA button URL')}
                  value={value.cta_url}
                  onChange={(e) => set('cta_url', e.currentTarget.value)}
                  placeholder="https://…"
                />
              </Group>
            </>
          )}
          <Group grow>
            <TextInput
              type="datetime-local"
              label={tx('Show from (your time zone)')}
              value={dateValue(value.starts_at)}
              onChange={(e) =>
                set(
                  'starts_at',
                  e.currentTarget.value
                    ? Math.floor(new Date(e.currentTarget.value).getTime() / 1000)
                    : null,
                )
              }
            />
            <TextInput
              type="datetime-local"
              label={tx('Hide after (your time zone)')}
              value={dateValue(value.ends_at)}
              onChange={(e) =>
                set(
                  'ends_at',
                  e.currentTarget.value
                    ? Math.floor(new Date(e.currentTarget.value).getTime() / 1000)
                    : null,
                )
              }
            />
          </Group>
          <NativeSelect
            label={tx('Audience')}
            value={value.audience}
            onChange={(e) =>
              set('audience', e.currentTarget.value as AnnouncementValue['audience'])
            }
            data={[
              ['everyone', 'Everyone'],
              ['guests', 'Only Guests'],
              ['authenticated', 'Only Authenticated'],
              ['subscribers', 'Subscribers'],
              ['non_subscribers', 'Non-Subscribers'],
              ['roles', 'Specific role groups'],
            ].map(([v, l]) => ({ value: v!, label: tx(l) }))}
          />
          {value.audience === 'roles' && (
            <TagsInput
              label={tx('Role groups')}
              data={roles.map((r) => ({ value: r.key, label: r.name }))}
              value={value.roles}
              acceptValueOnBlur={false}
              allowDuplicates={false}
              onChange={(items) =>
                set(
                  'roles',
                  items.filter((v) => roles.some((r) => r.key === v)),
                )
              }
            />
          )}
          {value.audience === 'subscribers' && (
            <Text size="xs" c="dimmed">
              {tx('Subscriber audiences activate when billing membership is implemented.')}
            </Text>
          )}
          <Checkbox
            label={tx('Allow visitors to dismiss')}
            checked={value.dismissible}
            onChange={(e) => set('dismissible', e.currentTarget.checked)}
          />
          <Text fw={600}>{tx('Preview')}</Text>
          <AnnouncementBanner
            preview
            item={{
              uid: 'preview',
              revision: 0,
              value,
              creator: '',
              created_at: 0,
              cancelled: false,
            }}
          />

          <Group>
            <Button
              loading={busy}
              disabled={uploading || (value.kind === 'notice' && !value.title.trim())}
              onClick={() => void save(false)}
            >
              {tx(editing?.cancelled ? 'Restore announcement' : 'Save announcement')}
            </Button>
            {editing && !editing.cancelled && (
              <Button color="red" variant="light" disabled={busy} onClick={() => void save(true)}>
                {tx('Cancel announcement')}
              </Button>
            )}
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
