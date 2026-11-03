import { useState } from 'react';
import { Button, Card, NativeSelect, Stack, TextInput, Title } from '@mantine/core';
import type { PageProps } from '../../shared/contracts.js';
import { lifecycleSchema } from '../../shared/reader.js';
import { postJson, errorMessage } from '../../client/api.js';
import { useFeedback } from '../../components/Feedback.js';
import { useI18n } from '../../localisation/index.js';
export function StoryStatus({
  props,
  work,
  canEdit,
}: {
  props: PageProps;
  work: string;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const initial = props.studio?.lifecycle;
  const [status, setStatus] = useState(initial?.status ?? 'ongoing'),
    [until, setUntil] = useState(
      initial?.hiatus_until ? new Date(initial.hiatus_until * 1000).toISOString().slice(0, 10) : '',
    ),
    [busy, setBusy] = useState(false);
  const [, error] = useFeedback('error');
  return (
    <Card>
      <Stack>
        <Title order={2}>{t('lifecycle.status')}</Title>
        <NativeSelect
          label={t('lifecycle.status')}
          disabled={!canEdit || busy}
          value={status}
          data={['ongoing', 'hiatus', 'abandoned', 'completed'].map((value) => ({
            value,
            label: t(`publishing.status.${value}`),
          }))}
          onChange={(event) =>
            setStatus(lifecycleSchema.shape.status.parse(event.currentTarget.value))
          }
        />
        {status === 'hiatus' && (
          <TextInput
            type="date"
            label={t('lifecycle.until')}
            description={t('lifecycle.until_help')}
            value={until}
            disabled={!canEdit || busy}
            onChange={(event) => setUntil(event.currentTarget.value)}
          />
        )}
        {canEdit && (
          <Button
            loading={busy}
            onClick={() => {
              setBusy(true);
              const timestamp =
                status === 'hiatus' && until ? Date.parse(`${until}T23:59:59Z`) / 1000 : null;
              const value = lifecycleSchema.safeParse({
                revision: initial?.revision ?? 0,
                status,
                hiatus_until: timestamp,
              });
              if (!value.success) {
                error(t('lifecycle.invalid'));
                setBusy(false);
                return;
              }
              void postJson(`/api/studio/works/${work}/status`, value.data)
                .then(() => window.location.reload())
                .catch((cause) => {
                  error(errorMessage(cause));
                  setBusy(false);
                });
            }}
          >
            {t('lifecycle.save')}
          </Button>
        )}
      </Stack>
    </Card>
  );
}
