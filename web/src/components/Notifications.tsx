import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Group,
  Indicator,
  Popover,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconBell, IconCheck, IconSettings, IconX } from '@tabler/icons-react';
import { inboxSchema } from '../shared/community.js';
import { postJson } from '../client/api.js';
import { useI18n } from '../localisation/index.js';
export function Notifications({ account }: { account: string }) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false);
  const [entries, setEntries] = useState<ReturnType<typeof inboxSchema.parse>['notifications']>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const response = await fetch('/api/notifications', { cache: 'no-store' });
      if (!response.ok) throw Error();
      const data = inboxSchema.parse(await response.json());
      setEntries(data.account === account ? data.notifications : []);
      setError('');
    } catch {
      setEntries([]);
      setError(t('notifications.failed'));
    }
  }
  useEffect(() => {
    void refresh();
    if (!('serviceWorker' in navigator)) {
      const timer = window.setInterval(() => void refresh(), 60000);
      return () => window.clearInterval(timer);
    }
    let stopped = false;
    let registrationFailed = false;
    const poll = () => {
      if (registrationFailed) {
        void refresh();
        return;
      }
      void navigator.serviceWorker.ready.then((reg) => {
        if (!stopped) reg.active?.postMessage({ action: 'notifications-poll' });
      });
    };
    void navigator.serviceWorker
      .register('/reader-sw.js', { scope: '/' })
      .then(poll)
      .catch(() => {
        registrationFailed = true;
        void refresh();
      });
    const timer = window.setInterval(poll, 60000);
    const message = (event: MessageEvent<unknown>) => {
      const value = event.data;
      if (
        value &&
        typeof value === 'object' &&
        'type' in value &&
        value.type === 'notifications-updated'
      )
        void refresh();
    };
    navigator.serviceWorker.addEventListener('message', message);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      navigator.serviceWorker.removeEventListener('message', message);
    };
  }, [account]);
  async function update(uid: string, dismiss = false, target?: string) {
    setBusy(true);
    try {
      await postJson('/api/notifications', { uid, dismiss });
      setEntries((old) =>
        dismiss
          ? old.filter((e) => e.uid !== uid)
          : old.map((e) => (e.uid === uid ? { ...e, read: true } : e)),
      );
      if (target) window.location.assign(target);
    } catch {
      setError(t('notifications.failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      width="min(440px, calc(100vw - 24px))"
      shadow="md"
    >
      <Popover.Target>
        <Tooltip label={t('notifications.title')}>
          <ActionIcon
            variant="subtle"
            aria-label={t('notifications.title')}
            aria-expanded={opened}
            onClick={() => {
              setOpened((value) => !value);
              void refresh();
            }}
          >
            <Indicator disabled={!entries.some((e) => !e.read)} size={7} offset={2}>
              <IconBell size={22} />
            </Indicator>
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={3} size="h4">
              {t('notifications.title')}
            </Title>
            <Tooltip label={t('notifications.settings_pending')}>
              <span>
                <ActionIcon variant="subtle" aria-label={t('notifications.settings')} disabled>
                  <IconSettings size={18} />
                </ActionIcon>
              </span>
            </Tooltip>
          </Group>
          <ScrollArea.Autosize mah={440}>
            {error ? (
              <Text role="alert" size="sm">
                {error}
              </Text>
            ) : entries.length === 0 ? (
              <Text c="dimmed" size="sm">
                {t('notifications.empty')}
              </Text>
            ) : (
              <Stack gap={4}>
                {entries.map((e) => (
                  <Group key={e.uid} wrap="nowrap" gap={6} className="notification-row">
                    <UnstyledButton
                      className="notification-target"
                      disabled={busy}
                      onClick={() =>
                        void update(
                          e.uid,
                          false,
                          `/read/${encodeURIComponent(e.work)}/${encodeURIComponent(e.chapter)}#comment-${encodeURIComponent(e.comment)}`,
                        )
                      }
                    >
                      <Group gap="sm" wrap="nowrap">
                        <img src={e.thumbnail} alt="" width={42} height={56} />
                        <Stack gap={2}>
                          <Group gap={5}>
                            {!e.read && (
                              <span
                                className="notification-unread"
                                aria-label={t('notifications.unread')}
                              />
                            )}
                            <Text fw={600} size="sm">
                              {e.title}
                            </Text>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {t(`notifications.${e.kind}`)}
                          </Text>
                        </Stack>
                      </Group>
                    </UnstyledButton>
                    <Stack gap={2}>
                      <Tooltip label={t('notifications.mark_read')}>
                        <ActionIcon
                          variant="subtle"
                          disabled={e.read || busy}
                          aria-label={t('notifications.mark_read')}
                          onClick={() => void update(e.uid)}
                        >
                          <IconCheck size={17} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={t('notifications.dismiss')}>
                        <ActionIcon
                          variant="subtle"
                          disabled={busy}
                          aria-label={t('notifications.dismiss')}
                          onClick={() => void update(e.uid, true)}
                        >
                          <IconX size={17} />
                        </ActionIcon>
                      </Tooltip>
                    </Stack>
                  </Group>
                ))}
              </Stack>
            )}
          </ScrollArea.Autosize>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
