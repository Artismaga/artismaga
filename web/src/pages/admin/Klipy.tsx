import { useState } from 'react';
import { Button, Card, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { postJson, errorMessage } from '../../client/api.js';
import { useI18n } from '../../localisation/index.js';
import { useFeedback } from '../../components/Feedback.js';
export function Klipy() {
  const { t } = useI18n();
  const [key, setKey] = useState(''),
    [busy, setBusy] = useState(false);
  const [, success] = useFeedback('success'),
    [, error] = useFeedback('error');
  return (
    <Card>
      <Stack>
        <Title order={3}>{t('comments.klipy_title')}</Title>
        <Text size="sm" c="dimmed">
          {t('comments.klipy_help')}
        </Text>
        <PasswordInput
          label={t('comments.api_key')}
          autoComplete="new-password"
          value={key}
          onChange={(e) => setKey(e.currentTarget.value)}
          maxLength={256}
        />
        <Button
          loading={busy}
          onClick={() => {
            setBusy(true);
            void postJson('/api/admin/comments/klipy', { api_key: key })
              .then(() => {
                setKey('');
                success(t('comments.provider_saved'));
              })
              .catch((e) => error(errorMessage(e)))
              .finally(() => setBusy(false));
          }}
        >
          {t('comments.save_provider')}
        </Button>
      </Stack>
    </Card>
  );
}
