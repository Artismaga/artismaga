import { useEffect, useState } from 'react';
import { Alert, Button, Text, Title, Stack, Group, Paper, CloseButton } from '@mantine/core';
import { IconInfoCircle, IconAlertTriangle, IconAlertOctagon } from '@tabler/icons-react';
import type { Announcement } from '../shared/announcements.js';
import { useI18n } from '../localisation/index.js';
export function AnnouncementBanner({
  item,
  preview = false,
}: {
  item: Announcement;
  preview?: boolean;
}) {
  const { tx } = useI18n();
  const [hidden, setHidden] = useState(false);
  const storageKey = `announcement:${item.uid}:${item.revision}`;
  useEffect(() => {
    try {
      setHidden(!preview && localStorage.getItem(storageKey) === 'dismissed');
    } catch {
      /* Storage can be unavailable. */
    }
  }, [storageKey, preview]);
  if (hidden) return null;
  const v = item.value;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(storageKey, 'dismissed');
    } catch {
      /* Dismiss for this visit. */
    }
  };
  if (v.kind === 'notice')
    return (
      <Alert
        mb="lg"
        title={v.title}
        color={v.severity === 'critical' ? 'red' : v.severity === 'warning' ? 'yellow' : 'blue'}
        icon={
          v.severity === 'critical' ? (
            <IconAlertOctagon />
          ) : v.severity === 'warning' ? (
            <IconAlertTriangle />
          ) : (
            <IconInfoCircle />
          )
        }
        withCloseButton={v.dismissible && !preview}
        closeButtonLabel={tx('Dismiss announcement')}
        onClose={dismiss}
      >
        {v.description}
      </Alert>
    );
  const imageOnly = !v.title.trim() && !v.description.trim() && !v.cta_text.trim();
  return (
    <Paper mb="lg" className="promotion-banner" p="xl" radius="lg" withBorder>
      {v.image && (
        <div className="promotion-image" style={{ backgroundImage: `url(/media/${v.image})` }} />
      )}
      {imageOnly ? (
        <a
          className="promotion-link"
          href={v.cta_url}
          aria-label={tx('View promotion')}
          rel="noopener noreferrer"
        />
      ) : (
        <Stack className="promotion-copy" gap="sm" justify="space-between">
          <div className="promotion-text">
            {v.title && <Title order={2}>{v.title}</Title>}
            {v.description && <Text mt="sm">{v.description}</Text>}
          </div>
          {v.cta_text && (
            <Group>
              <Button component="a" href={v.cta_url} rel="noopener noreferrer">
                {v.cta_text}
              </Button>
            </Group>
          )}
        </Stack>
      )}
      {v.dismissible && !preview && (
        <CloseButton
          className="promotion-close"
          onClick={dismiss}
          aria-label={tx('Dismiss announcement')}
        />
      )}
    </Paper>
  );
}
