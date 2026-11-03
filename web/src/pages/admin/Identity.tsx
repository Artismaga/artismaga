import { useFeedback } from '../../components/Feedback.js';
import { IconWorld, IconPalette, IconSettings } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  Accordion,
  ActionIcon,
  Collapse,
  Button,
  Card,
  Checkbox,
  ColorInput,
  Group,
  NavLink,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Badge,
} from '@mantine/core';
import type { ConfigurationUpdate, SiteConfiguration } from '../../shared/settings.js';
import { configurationUpdateSchema } from '../../shared/settings.js';
import { useAppearance } from '../../components/Appearance.js';
import { postJson, errorMessage } from '../../client/api.js';
import { useI18n } from '../../localisation/index.js';
const keysSchema = z.object({
  locale: z.string(),
  keys: z.array(
    z.object({
      key: z.string(),
      revision: z.number(),
      live: z.string().nullable().optional(),
      draft: z.string().nullable().optional(),
    }),
  ),
});
const themeOptions = [{ key: 'primary_colour', type: 'colour', label: 'UI base colour' }] as const;
export function Identity({
  settings,
  section,
}: {
  settings: ConfigurationUpdate;
  section: string;
}) {
  const { tx } = useI18n();
  const appearance = useAppearance();
  const [c, setC] = useState(settings.configuration);
  const [revision, setRevision] = useState(settings.revision);
  const [keys, setKeys] = useState<z.infer<typeof keysSchema> | null>(null);
  const [name, setName] = useState(c.site_name);
  const [headline, setHeadline] = useState(c.tagline);
  const [, setError] = useFeedback('error');
  const [, setNotice] = useFeedback('success');
  const [themeEditor, setThemeEditor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const view = section.split('/')[1] ?? 'site';
  async function loadKeys() {
    const r = await fetch('/api/admin/identity-keys');
    if (!r.ok) throw Error('Identity unavailable');
    const next = keysSchema.parse(await r.json());
    setKeys(next);
    setName(
      next.keys.find((k) => k.key === 'site.name')?.draft ??
        next.keys.find((k) => k.key === 'site.name')?.live ??
        c.site_name,
    );
    setHeadline(
      next.keys.find((k) => k.key === 'discovery.headline')?.draft ??
        next.keys.find((k) => k.key === 'discovery.headline')?.live ??
        c.tagline,
    );
    return next;
  }
  useEffect(() => {
    void loadKeys().catch((e: unknown) => setError(errorMessage(e)));
  }, []);
  const update = <K extends keyof SiteConfiguration>(key: K, value: SiteConfiguration[K]) =>
    setC((old) => ({ ...old, [key]: value }));
  async function saveSettings() {
    setBusy(true);
    setError('');
    try {
      const result = await postJson(
        '/api/admin/configuration',
        configurationUpdateSchema.parse({ revision, configuration: c }),
      );
      if (result.revision !== undefined) setRevision(result.revision);
      setNotice(
        'Identity settings saved. Reload to apply saved links and theme availability across the site.',
      );
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveKeys(publish = false) {
    if (!keys) return;
    setBusy(true);
    setError('');
    try {
      for (const [key, text] of [
        ['site.name', name],
        ['discovery.headline', headline],
      ]) {
        const row = keys.keys.find((k) => k.key === key);
        await postJson('/api/localisation/keys', {
          key,
          locale: keys.locale,
          text,
          revision: row?.revision ?? 0,
          publish,
          discard: false,
        });
      }
      await loadKeys();
      setNotice(
        publish
          ? 'Site identity published.'
          : 'Identity draft saved. Preview it across the site before publishing.',
      );
    } catch (e: unknown) {
      setError(errorMessage(e));
      await loadKeys().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const readyToPublish =
    keys?.keys.find((k) => k.key === 'site.name')?.draft === name &&
    keys?.keys.find((k) => k.key === 'discovery.headline')?.draft === headline;
  return (
    <div className="identity-layout">
      <Card p="sm">
        <NavLink
          component="a"
          href="/admin/identity/site"
          label={tx('Site')}
          leftSection={<IconWorld size={18} />}
          active={view === 'site'}
        />
        <NavLink
          component="a"
          href="/admin/identity/themes"
          label={tx('Themes')}
          leftSection={<IconPalette size={18} />}
          active={view === 'themes'}
        />
      </Card>
      <Stack>
        {view === 'site' ? (
          <>
            <Card>
              <Title order={2}>{tx('Site identity')}</Title>
              <Text size="sm" c="dimmed" my="sm">
                {tx(
                  'Site name and Discovery headline edit localisation keys in the site source language. Save a draft, preview, then publish.',
                )}
              </Text>
              <Stack>
                <Badge variant="light">{keys?.locale ?? '…'}</Badge>
                <TextInput
                  label={tx('Site name')}
                  maxLength={100}
                  required
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                />
                <TextInput
                  label={tx('Discovery headline')}
                  maxLength={100}
                  value={headline}
                  onChange={(e) => setHeadline(e.currentTarget.value)}
                />
                <Group>
                  <Button
                    disabled={!keys || busy || !name.trim() || !headline.trim()}
                    onClick={() => void saveKeys()}
                  >
                    {tx('Save identity draft')}
                  </Button>
                  <Button
                    variant="light"
                    disabled={busy || !readyToPublish}
                    onClick={() => void saveKeys(true)}
                  >
                    {tx('Confirm publish identity')}
                  </Button>
                </Group>
              </Stack>
            </Card>
            <Card>
              <Stack>
                <Title order={2}>{tx('Site details')}</Title>
                <Textarea
                  label={tx('Site description')}
                  maxLength={500}
                  value={c.description}
                  onChange={(e) => update('description', e.currentTarget.value)}
                />
                <TextInput
                  label={tx('Support or contact link')}
                  type="url"
                  value={c.support_url}
                  onChange={(e) => update('support_url', e.currentTarget.value)}
                />
                <Title order={3}>{tx('Social links')}</Title>
                {[
                  ['x', 'Twitter / X'],
                  ['youtube', 'YouTube'],
                  ['instagram', 'Instagram'],
                  ['facebook', 'Facebook'],
                  ['bluesky', 'Bluesky'],
                  ['discord', 'Discord'],
                ].map(([network, label]) => (
                  <TextInput
                    key={network}
                    label={label}
                    type="url"
                    placeholder="https://…"
                    value={c.socials[network!] ?? ''}
                    onChange={(e) =>
                      update('socials', { ...c.socials, [network!]: e.currentTarget.value })
                    }
                  />
                ))}
                <Button loading={busy} onClick={() => void saveSettings()}>
                  {tx('Save site details')}
                </Button>
              </Stack>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <Title order={2}>{tx('Themes')}</Title>
              <Text c="dimmed" size="sm" mt="sm">
                {tx(
                  'Configure themes without editing code. Disabled themes remain available to administrators for preview.',
                )}
              </Text>
            </Card>
            <Accordion multiple defaultValue={['builtin']}>
              <Accordion.Item value="builtin">
                <Accordion.Control>{tx('Built-in')}</Accordion.Control>
                <Accordion.Panel>
                  <Stack>
                    {(['light', 'dark', 'sepia'] as const).map((mode) => (
                      <Card key={mode} withBorder>
                        <Group justify="space-between">
                          <Title order={3}>
                            {tx(mode === 'light' ? 'Light' : mode === 'dark' ? 'Dark' : 'Sepia')}
                          </Title>
                          <Group>
                            <Badge>{tx('Built-in')}</Badge>
                            <ActionIcon
                              variant="subtle"
                              aria-label={tx('Configure theme')}
                              aria-expanded={themeEditor === mode}
                              onClick={() => setThemeEditor(themeEditor === mode ? null : mode)}
                            >
                              <IconSettings size={19} />
                            </ActionIcon>
                          </Group>
                        </Group>
                        <Checkbox
                          mt="md"
                          label={tx('Available to users')}
                          checked={c.themes[mode].enabled}
                          onChange={(e) =>
                            update('themes', {
                              ...c.themes,
                              [mode]: { ...c.themes[mode], enabled: e.currentTarget.checked },
                            })
                          }
                        />
                        <Collapse expanded={themeEditor === mode}>
                          {themeOptions.map((option) => (
                            <ColorInput
                              key={option.key}
                              mt="md"
                              label={tx(option.label)}
                              value={c.themes[mode][option.key]}
                              format="hex"
                              swatches={['#24675a', '#4655a5', '#8c3e68', '#80592d', '#375c7c']}
                              onChange={(value) => {
                                update('themes', {
                                  ...c.themes,
                                  [mode]: { ...c.themes[mode], [option.key]: value },
                                });
                                if (/^#[0-9a-f]{6}$/i.test(value)) {
                                  appearance.previewTheme(mode, value);
                                }
                              }}
                            />
                          ))}
                          <Button
                            mt="md"
                            variant="light"
                            onClick={() =>
                              appearance.previewTheme(mode, c.themes[mode].primary_colour)
                            }
                          >
                            {tx('Preview theme')}
                          </Button>
                        </Collapse>
                      </Card>
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
              <Accordion.Item value="custom">
                <Accordion.Control>{tx('Custom')}</Accordion.Control>
                <Accordion.Panel>
                  <Text c="dimmed">
                    {tx(
                      'No custom themes installed. Future themes can declare their own configuration options.',
                    )}
                  </Text>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
            <Button loading={busy} onClick={() => void saveSettings()}>
              {tx('Save theme settings')}
            </Button>
          </>
        )}
      </Stack>
    </div>
  );
}
