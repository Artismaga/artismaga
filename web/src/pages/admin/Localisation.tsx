import { useFeedback } from '../../components/Feedback.js';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import {
  Card,
  Title,
  Text,
  Stack,
  Group,
  Button,
  TextInput,
  Textarea,
  NativeSelect,
  Switch,
  TagsInput,
  Modal,
  Badge,
  Code,
  PasswordInput,
} from '@mantine/core';
import { ApiForm } from '../../components/Form.js';
import { postJson, errorMessage } from '../../client/api.js';
import { formatMessage, useI18n } from '../../localisation/index.js';
const definition = z.object({
  key: z.string(),
  owner: z.string(),
  description: z.string(),
  defaults: z.record(z.string(), z.string()),
  placeholders: z.record(z.string(), z.string()),
});
const override = z.object({
  key: z.string(),
  locale: z.string(),
  live: z.string().nullable().optional(),
  draft: z.string().nullable().optional(),
  revision: z.number(),
  author: z.string(),
});
export const localisationEditorSchema = z.object({
  settings: z.object({
    revision: z.number(),
    source_locale: z.string(),
    enabled: z.array(z.string()),
  }),
  definitions: z.array(definition),
  overrides: z.array(override),
  translation: z.object({
    revision: z.number(),
    value: z.object({ provider: z.string(), cache_days: z.number() }),
    credentials_set: z.boolean(),
  }),
  runtime: z.string(),
});
export function Localisation({ data }: { data: unknown }) {
  const { tx, t, options } = useI18n();
  const initial = localisationEditorSchema.parse(data);
  const [rows, setRows] = useState(initial.overrides);
  const [selected, setSelected] = useState<z.infer<typeof definition> | null>(null);
  const [language, setLanguage] = useState('en');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [, setError] = useFeedback('error');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState(initial.translation.value.provider);
  const [runtime, setRuntime] = useState(initial.runtime);
  const [cacheDays, setCacheDays] = useState(initial.translation.value.cache_days);
  const [apiKey, setApiKey] = useState('');
  const [providerRevision, setProviderRevision] = useState(initial.translation.revision);
  const [source, setSource] = useState(initial.settings.source_locale);
  const [enabled, setEnabled] = useState(initial.settings.enabled);
  const [settingsRevision, setSettingsRevision] = useState(initial.settings.revision);
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [onlyDrafts, setOnlyDrafts] = useState(false);
  useEffect(() => {
    if (provider !== 'local') return;
    const timer = setInterval(() => {
      void fetch('/api/localisation/runtime')
        .then(async (r) => z.object({ status: z.string() }).parse(await r.json()))
        .then((r) => setRuntime(r.status))
        .catch(() => setRuntime('unavailable'));
    }, 3000);
    return () => clearInterval(timer);
  }, [provider]);
  const row = selected
    ? rows.find((r) => r.key === selected.key && r.locale === language)
    : undefined;
  function open(def: z.infer<typeof definition>) {
    setSelected(def);
    setText(
      rows.find((r) => r.key === def.key && r.locale === language)?.draft ??
        rows.find((r) => r.key === def.key && r.locale === language)?.live ??
        def.defaults[language] ??
        def.defaults['en'] ??
        '',
    );
    setSamples(def.placeholders);
    setError('');
  }
  async function save(publish = false, discard = false) {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const result = await postJson('/api/localisation/keys', {
        key: selected.key,
        locale: language,
        text,
        revision: row?.revision ?? 0,
        publish,
        discard,
      });
      if (result.revision === undefined) throw Error('Could not confirm revision');
      const next = {
        key: selected.key,
        locale: language,
        revision: result.revision,
        author: 'you',
        live: publish ? text : (row?.live ?? null),
        draft: publish || discard ? null : text,
      };
      setRows((old) => [
        ...old.filter((r) => r.key !== selected.key || r.locale !== language),
        next,
      ]);
      if (publish || discard) setSelected(null);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack>
      <Title order={1}>{t('ui.localisation_f31f4fc8')}</Title>
      <Text c="dimmed">{t('ui.published_translations_are_shown_to_everyone_sav_4a16a532')}</Text>
      <Card>
        <Title order={2}>{t('ui.languages_318655ce')}</Title>
        <ApiForm
          api="/api/localisation/settings"
          label={t('ui.save_languages_ccd5ad94')}
          transform={() => ({ revision: settingsRevision, source_locale: source, enabled })}
          onSaved={(r) => {
            if (r.revision !== undefined) setSettingsRevision(r.revision);
          }}
        >
          <NativeSelect
            label={t('ui.source_language_088b23e3')}
            data={options(['en', 'ja', 'zh', 'es', 'fr'])}
            value={source}
            onChange={(e) => setSource(e.currentTarget.value)}
          />
          <TagsInput
            label={t('ui.enabled_languages_a7a3a8ab')}
            data={options(['en', 'ja', 'zh', 'es', 'fr'])}
            value={enabled}
            onChange={(v) =>
              setEnabled(v.filter((l) => ['en', 'ja', 'zh', 'es', 'fr'].includes(l)))
            }
          />
        </ApiForm>
        <Group mt="md">
          <Button
            variant="light"
            onClick={() =>
              void postJson('/api/localisation/preview', { enabled: true }).then(() =>
                window.location.reload(),
              )
            }
          >
            {t('ui.preview_drafts_on_site_deebc11b')}
          </Button>
          <Button
            variant="default"
            onClick={() =>
              void postJson('/api/localisation/preview', { enabled: false }).then(() =>
                window.location.reload(),
              )
            }
          >
            {t('ui.view_published_text_f264c2d4')}
          </Button>
        </Group>
      </Card>
      <Card>
        <Title order={2}>{t('ui.automatic_translation_2981c4cf')}</Title>
        <Text c="dimmed" size="sm" my="sm">
          {t('ui.the_local_4b_translator_downloads_its_verified_m_ed92fed7')}
        </Text>
        <ApiForm
          api="/api/localisation/translation"
          label={t('ui.save_translation_options_8fe38952')}
          transform={() => ({
            revision: providerRevision,
            value: { provider, cache_days: cacheDays },
            api_key: apiKey || null,
          })}
          onSaved={(r) => {
            if (r.revision !== undefined) setProviderRevision(r.revision);
            setApiKey('');
          }}
        >
          <NativeSelect
            label={t('ui.provider_472590ae')}
            value={provider}
            onChange={(e) => setProvider(e.currentTarget.value)}
            data={options([
              { value: 'local', label: 'Local · Qwen3 4B (default)' },
              { value: 'google', label: 'Google Translate' },
              { value: 'disabled', label: 'Disabled' },
            ])}
          />
          <TextInput
            label={t('ui.cache_lifetime_days_c252ab20')}
            type="number"
            min={1}
            max={365}
            value={cacheDays}
            onChange={(e) => setCacheDays(Number(e.currentTarget.value))}
          />
          {provider === 'google' && (
            <PasswordInput
              label={t('ui.new_google_api_key_23b15ebc')}
              description={t('ui.leave_blank_to_keep_the_saved_key_saved_credenti_616a8aca')}
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
              autoComplete="new-password"
            />
          )}
          <Text size="sm">
            {t('runtime.status', {
              status: [
                'ready',
                'downloading',
                'loading',
                'not_loaded',
                'download_failed',
                'load_failed',
              ].includes(runtime)
                ? t(`status.${runtime}`)
                : tx(runtime),
            })}
          </Text>
        </ApiForm>
      </Card>
      <Card>
        <Group align="end" mb="md">
          <TextInput
            className="grow"
            label={t('ui.search_localisation_keys_51d2dd8b')}
            placeholder={t('ui.key_namespace_or_source_text_f2fd8e1b')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <NativeSelect
            label={t('ui.language_a4fe6526')}
            value={language}
            onChange={(e) => {
              setLanguage(e.currentTarget.value);
              setSelected(null);
            }}
            data={options([
              { value: 'en', label: 'English' },
              { value: 'ja', label: '日本語' },
              { value: 'zh', label: '简体中文' },
              { value: 'es', label: 'Español' },
              { value: 'fr', label: 'Français' },
            ])}
          />
          <Switch
            label={t('ui.drafts_only_f1f1beb9')}
            checked={onlyDrafts}
            onChange={(e) => setOnlyDrafts(e.currentTarget.checked)}
          />
        </Group>
        <Stack>
          {initial.definitions
            .filter(
              (d) =>
                `${d.key} ${d.defaults['en'] ?? ''}`.toLowerCase().includes(search.toLowerCase()) &&
                (!onlyDrafts ||
                  rows.some((r) => r.key === d.key && r.locale === language && r.draft)),
            )
            .slice(0, 60)
            .map((def) => {
              const saved = rows.find((r) => r.key === def.key && r.locale === language);
              return (
                <Group key={def.key} justify="space-between" wrap="nowrap">
                  <div className="grow">
                    <Code style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
                      {def.key}
                    </Code>
                    <Text size="sm" lineClamp={2}>
                      {saved?.draft ?? saved?.live ?? def.defaults[language]}
                    </Text>
                  </div>
                  {saved?.draft && <Badge>{t('ui.draft_ebf12ef4')}</Badge>}
                  <Button variant="light" size="xs" onClick={() => open(def)}>
                    {t('ui.edit_translation_434b894f')}
                  </Button>
                </Group>
              );
            })}
        </Stack>
        <Text size="xs" c="dimmed" mt="md">
          {t('ui.showing_up_to_60_matching_keys_refine_the_search_5365e81b')}
        </Text>
      </Card>
      <Modal
        opened={selected !== null}
        onClose={() => {
          if (!busy) setSelected(null);
        }}
        title={t('ui.edit_localisation_4a111ee0')}
        size="lg"
      >
        <Stack>
          {selected && (
            <>
              <Code style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>{selected.key}</Code>
              <Text size="sm" c="dimmed">
                {selected.description}
              </Text>
              <Textarea
                label={t('ui.translation_draft_470b70fa')}
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                minRows={4}
                maxLength={16000}
              />
              {Object.entries(samples).map(([name, value]) => (
                <TextInput
                  key={name}
                  label={t('preview.placeholder', { name })}
                  value={value}
                  onChange={(e) => setSamples({ ...samples, [name]: e.currentTarget.value })}
                />
              ))}
              <Card withBorder>
                <Text size="xs" c="dimmed">
                  {t('ui.preview_with_example_values_2b6feabc')}
                </Text>
                <Text mt="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {formatMessage(text, samples)}
                </Text>
              </Card>
              <Text size="xs" c="dimmed">
                {t('ui.saved_drafts_can_be_previewed_in_their_actual_pa_cb071e94')}
              </Text>
              <Button
                variant="light"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError('');
                  void fetch('/api/localisation/translate-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: selected.key, locale: language }),
                  })
                    .then(async (r) => {
                      if (!r.ok) throw Error('Translation unavailable; check the provider status');
                      return z.object({ text: z.string() }).parse(await r.json());
                    })
                    .then((r) => setText(r.text))
                    .catch((e: unknown) => setError(errorMessage(e)))
                    .finally(() => setBusy(false));
                }}
              >
                {t('ui.generate_translation_for_review_f45d9097')}
              </Button>
              <Group>
                <Button loading={busy} onClick={() => void save()}>
                  {t('ui.save_draft_3de10010')}
                </Button>
                <Button
                  disabled={busy || row?.draft !== text || !row?.draft}
                  onClick={() => void save(true)}
                >
                  {t('ui.confirm_publish_b4583fa8')}
                </Button>
                <Button
                  variant="subtle"
                  color="red"
                  disabled={busy || !row?.draft}
                  onClick={() => void save(false, true)}
                >
                  {t('ui.discard_draft_cb30147e')}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
