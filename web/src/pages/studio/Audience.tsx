import { useState } from 'react';
import { Button, Card, Group, NumberInput, Stack, Text, Title } from '@mantine/core';
import { useI18n } from '../../localisation/index.js';
import { targetAudienceSchema } from '../../shared/creative.js';
import type { Details } from '../../shared/creative.js';
import type { ChangeDetails } from './Chapters.js';
export function Audience({
  details,
  change,
  canEdit,
  busy,
}: {
  details: Details;
  change: ChangeDetails;
  canEdit: boolean;
  busy: boolean;
}) {
  const { t } = useI18n();
  const [minimum, setMinimum] = useState<number | string>(
    details.value.target_audience.minimum_age ?? '',
  );
  const [maximum, setMaximum] = useState<number | string>(
    details.value.target_audience.maximum_age ?? '',
  );
  const value = {
    minimum_age: minimum === '' ? null : Number(minimum),
    maximum_age: maximum === '' ? null : Number(maximum),
  };
  const valid = targetAudienceSchema.safeParse(value).success;
  return (
    <Card maw={780}>
      <Stack>
        <Title order={2}>{t('work.audience.title')}</Title>
        <Text c="dimmed" size="sm">
          {t('work.audience.description')}
        </Text>
        <Group grow align="start">
          <NumberInput
            label={t('work.audience.minimum')}
            description={t('work.audience.minimum_help')}
            min={0}
            max={120}
            allowDecimal={false}
            allowNegative={false}
            value={minimum}
            onChange={setMinimum}
            disabled={!canEdit || busy}
          />
          <NumberInput
            label={t('work.audience.maximum')}
            description={t('work.audience.maximum_help')}
            min={0}
            max={120}
            allowDecimal={false}
            allowNegative={false}
            value={maximum}
            onChange={setMaximum}
            disabled={!canEdit || busy}
          />
        </Group>
        {!valid && (
          <Text c="red" size="sm" role="alert">
            {t('work.audience.invalid')}
          </Text>
        )}
        <Group>
          <Button
            disabled={!canEdit || !valid}
            loading={busy}
            onClick={() => void change({ action: 'audience', target_audience: value })}
          >
            {t('ui.save_changes_dd0ae7a5')}
          </Button>
          <Button
            variant="subtle"
            disabled={!canEdit || busy}
            onClick={() => {
              setMinimum('');
              setMaximum('');
            }}
          >
            {t('work.audience.clear')}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
