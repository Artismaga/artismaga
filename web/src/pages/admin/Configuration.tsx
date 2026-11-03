import { useState } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  NativeSelect,
  SimpleGrid,
  Badge,
  Title,
  Checkbox,
  NumberInput,
} from '@mantine/core';
import { ApiForm, formText } from '../../components/Form.js';
import { ArtworkInput } from '../../components/ArtworkInput.js';
import type { AssetRef } from '../../shared/studio.js';
import type { ConfigurationUpdate } from '../../shared/settings.js';
import { configurationUpdateSchema, languages } from '../../shared/settings.js';
import { useI18n } from '../../localisation/index.js';
export function Configuration({
  settings,
  mailEnabled,
  roles,
}: {
  settings: ConfigurationUpdate;
  mailEnabled: boolean;
  roles: { key: string; name: string }[];
}) {
  const { t, tx, options } = useI18n();
  const [abandon, setAbandon] = useState(settings.configuration.auto_abandon_after_months !== null);
  const [months, setMonths] = useState<number | string>(
    settings.configuration.auto_abandon_after_months ?? 2,
  );
  const [revision, setRevision] = useState(settings.revision);
  const c = settings.configuration;
  const [uploading, setUploading] = useState(false);
  const [cover, setCover] = useState<AssetRef | null>(
    c.default_cover
      ? { uid: c.default_cover, url: `/media/${c.default_cover}`, palette: [] }
      : null,
  );
  return (
    <Card>
      <Title order={2}>{tx('Platform configuration')}</Title>
      <ApiForm
        api="/api/admin/configuration"
        label={tx('Save configuration')}
        disabled={uploading}
        transform={(data) =>
          configurationUpdateSchema.parse({
            revision,
            configuration: {
              ...c,
              signup_mode: formText(data, 'signup_mode'),
              default_group: formText(data, 'default_group'),
              default_language: formText(data, 'default_language'),
              timezone: formText(data, 'timezone'),
              default_cover: cover?.uid ?? null,
              auto_abandon_after_months: abandon ? Number(months) : null,
            },
          })
        }
        onSaved={(result) => {
          if (result.revision !== undefined) setRevision(result.revision);
        }}
      >
        <Stack>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <NativeSelect
              name="signup_mode"
              label={tx('Who can register?')}
              defaultValue={c.signup_mode}
              data={options([
                { value: 'open', label: 'Anyone' },
                { value: 'invitation', label: 'Invitation required' },
                { value: 'disabled', label: 'Registration closed' },
              ])}
            />
            <NativeSelect
              name="default_group"
              label={tx('New account permission group')}
              defaultValue={c.default_group}
              data={roles
                .filter((r) => r.key !== 'administrator')
                .map((r) => ({ value: r.key, label: r.name }))}
            />
            <NativeSelect
              name="default_language"
              label={tx('Default content language')}
              defaultValue={c.default_language}
              data={languages}
            />
            <NativeSelect
              name="timezone"
              label={tx('Site time zone')}
              defaultValue={c.timezone}
              data={Array.from(
                new Set([
                  'UTC',
                  'America/New_York',
                  'Europe/London',
                  'Asia/Tokyo',
                  'Australia/Sydney',
                  c.timezone,
                ]),
              )}
            />
          </SimpleGrid>
          <Checkbox
            label={t('lifecycle.auto')}
            checked={abandon}
            onChange={(event) => setAbandon(event.currentTarget.checked)}
          />
          {abandon && (
            <NumberInput
              label={t('lifecycle.auto_months')}
              min={1}
              max={120}
              value={months}
              onChange={setMonths}
            />
          )}
          <Text size="sm" c="dimmed">
            {t('lifecycle.auto_help')}
          </Text>
          <ArtworkInput
            label={tx('Default work cover')}
            purpose="default_cover"
            value={cover}
            onChange={setCover}
            onBusyChange={setUploading}
            fallback="/assets/default-cover.svg"
          />
          <Group justify="space-between">
            <Text>{tx('Email delivery')}</Text>
            <Badge>{tx(mailEnabled ? 'Configured' : 'Not configured')}</Badge>
          </Group>
          <Text size="sm" c="dimmed">
            {tx(
              'SMTP credentials remain in private installation configuration. Localisation controls the interface source language.',
            )}
          </Text>
        </Stack>
      </ApiForm>
    </Card>
  );
}
