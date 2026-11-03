import { useFeedback } from '../../components/Feedback.js';
// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import {
  Card,
  Title,
  Text,
  Stack,
  Group,
  Button,
  NativeSelect,
  Textarea,
  Checkbox,
  Alert,
  Skeleton,
  Badge,
} from '@mantine/core';
import { translationPageSchema } from '../../shared/translations.js';
import type { TranslationPage } from '../../shared/translations.js';
import { RecipientsInput } from '../../components/RecipientsInput.js';
import { postJson, errorMessage } from '../../client/api.js';
export function Translations({
  uid,
  initial,
  onRevision,
}: {
  uid: string;
  initial: TranslationPage | null;
  onRevision: (revision: number) => void;
}) {
  const { t, tx, options } = useI18n();

  const [data, setData] = useState(initial);
  const [scope, setScope] = useState('overview');
  const [language, setLanguage] = useState(initial?.source_locale === 'en' ? 'ja' : 'en');
  const [fields, setFields] = useState<Record<string, string>>(
    initial?.translations[0]?.value.draft ?? initial?.translations[0]?.value.live ?? {},
  );
  const [, setError] = useFeedback('error');
  const [, setNotice] = useFeedback('success');
  const [busy, setBusy] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [draft, setDraft] = useState(true);
  const [approve, setApprove] = useState(false);
  async function load(selectedScope = scope, locale = language) {
    const r = await fetch(
      `/api/studio/works/${uid}/translations?scope=${encodeURIComponent(selectedScope)}&locale=${locale}`,
    );
    if (!r.ok) throw Error('Translations unavailable');
    const next = translationPageSchema.parse(
      z.object({ translations: z.unknown() }).parse(await r.json()).translations,
    );
    setData(next);
    onRevision(next.work_revision);
    setFields(next.translations[0]?.value.draft ?? next.translations[0]?.value.live ?? {});
    return next;
  }
  useEffect(() => {
    let alive = true;
    void load().catch((e: unknown) => {
      if (alive) setError(errorMessage(e));
    });
    return () => {
      alive = false;
    };
  }, [scope, language]);
  const current = data?.translations[0];
  const source = data?.scopes.find((s) => s.uid === scope);
  const grant = data?.grants.find((g) => g.locale === language);
  const canDraft = data?.can_manage || grant?.can_draft;
  const canApprove = data?.can_manage || grant?.can_approve;
  async function save(publish: boolean) {
    if (!source) return;
    setBusy(true);
    setError('');
    try {
      await postJson(`/api/studio/works/${uid}/translations`, {
        scope,
        locale: language,
        revision: current?.revision ?? 0,
        fields: {
          ...Object.fromEntries(Object.keys(source.fields).map((k) => [k, ''])),
          ...fields,
        },
        source_hash: source.source_hash,
        approve: publish,
      });
      await load();
      setNotice(publish ? 'Translation approved.' : 'Translation draft saved.');
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <Card>
        <Skeleton h={24} mb="md" />
        <Text>{tx('Loading translation configuration…')}</Text>
      </Card>
    );
  return (
    <Stack>
      <Card>
        <Title order={2}>{t('ui.translations_266a41b9')}</Title>
        <Text c="dimmed" size="sm" my="sm">
          {t('ui.manage_overview_and_chapter_information_in_each__17e10710')}
        </Text>
        {data.can_manage && (
          <Group align="end">
            <NativeSelect
              label={t('ui.work_source_language_f676b4e5')}
              data={options(['en', 'ja', 'zh', 'es', 'fr'])}
              value={data.source_locale}
              onChange={(e) => setData({ ...data, source_locale: e.currentTarget.value })}
            />
            <Button
              variant="light"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void postJson(`/api/studio/works/${uid}/translations/source`, {
                  locale: data.source_locale,
                })
                  .then(() => load())
                  .catch((e: unknown) => setError(errorMessage(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {t('ui.save_source_language_bd3066db')}
            </Button>
          </Group>
        )}
        <Group grow mt="md">
          <NativeSelect
            label={t('ui.content_to_translate_e08872ab')}
            value={scope}
            onChange={(e) => setScope(e.currentTarget.value)}
            data={data.scopes.map((s) => ({
              value: s.uid,
              label: s.uid === 'overview' ? t('ui.overview_d4b1ea57') : s.title,
            }))}
          />
          <NativeSelect
            label={t('ui.target_language_ea252b75')}
            value={language}
            onChange={(e) => setLanguage(e.currentTarget.value)}
            data={options(['en', 'ja', 'zh', 'es', 'fr'])}
          />
        </Group>
        {current && current.value.source_hash !== source?.source_hash && (
          <Alert color="yellow" mt="md">
            {t('ui.the_source_has_changed_review_the_new_source_bef_816d6288')}
          </Alert>
        )}
        {Object.entries(source?.fields ?? {}).map(([key, original]) => (
          <Stack key={key} gap="xs" mt="lg">
            <Text fw={600}>{tx(key.charAt(0).toUpperCase() + key.slice(1))}</Text>
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
              {original || tx('No source text')}
            </Text>
            <Textarea
              label={t('translation.field', {
                field: tx(key.charAt(0).toUpperCase() + key.slice(1)),
              })}
              value={fields[key] ?? ''}
              onChange={(e) => setFields({ ...fields, [key]: e.currentTarget.value })}
              minRows={key === 'synopsis' ? 4 : 1}
              disabled={!canDraft && !canApprove}
            />
            <Button
              variant="subtle"
              size="xs"
              disabled={busy || !original || (!canDraft && !canApprove)}
              onClick={() => {
                setBusy(true);
                setError('');
                void fetch(`/api/studio/works/${uid}/translate-content`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ scope, locale: language, field: key }),
                })
                  .then(async (r) => {
                    const body: unknown = await r.json();
                    if (!r.ok)
                      throw Error(
                        'Automatic translation unavailable; check your preferences and the provider',
                      );
                    const result = z.object({ text: z.string() }).parse(body);
                    if (typeof result.text !== 'string')
                      throw Error('Invalid translation response');
                    const translated = result.text;
                    setFields((old) => ({ ...old, [key]: translated }));
                  })
                  .catch((e: unknown) => setError(errorMessage(e)))
                  .finally(() => setBusy(false));
              }}
            >
              {t('ui.generate_draft_text_0c84d0be')}
            </Button>
          </Stack>
        ))}
        <Group mt="lg">
          <Button loading={busy} disabled={!canDraft} onClick={() => void save(false)}>
            {t('ui.save_translation_draft_0a80d184')}
          </Button>
          <Button
            disabled={
              busy ||
              !canApprove ||
              !current?.value.draft ||
              JSON.stringify(fields) !== JSON.stringify(current.value.draft) ||
              current.value.source_hash !== source?.source_hash
            }
            onClick={() => void save(true)}
          >
            {t('ui.review_approve_a80aae23')}
          </Button>
          {current?.value.live && <Badge>{t('ui.approved_version_available_48975c9f')}</Badge>}
        </Group>
      </Card>
      {data.can_manage && (
        <Card>
          <Title order={2}>{t('ui.language_permissions_a06344a9')}</Title>
          <Text size="sm" c="dimmed" my="sm">
            {t('ui.permissions_apply_to_the_selected_target_languag_39331663')}
          </Text>
          <RecipientsInput work={uid} value={recipients} onChange={setRecipients} disabled={busy} />
          <Group my="md">
            <Checkbox
              label={t('ui.may_draft_translations_ca43c0ff')}
              checked={draft}
              onChange={(e) => setDraft(e.currentTarget.checked)}
            />
            <Checkbox
              label={t('ui.may_review_and_approve_ebc3b9a2')}
              checked={approve}
              onChange={(e) => setApprove(e.currentTarget.checked)}
            />
          </Group>
          <Button
            disabled={busy || !recipients.length || (!draft && !approve)}
            onClick={() => {
              setBusy(true);
              void postJson(`/api/studio/works/${uid}/translations/access`, {
                recipients,
                locale: language,
                can_draft: draft,
                can_approve: approve,
                remove: false,
              })
                .then(() => load())
                .then(() => setRecipients([]))
                .catch((e: unknown) => setError(errorMessage(e)))
                .finally(() => setBusy(false));
            }}
          >
            {t('ui.apply_language_permissions_ddebd642')}
          </Button>
          <Stack mt="lg">
            {data.grants
              .filter((g) => g.locale === language)
              .map((g) => (
                <Group key={g.uid} justify="space-between">
                  <Text size="sm">
                    {g.display_name} {t('ui.text_a137f17a')}
                    {g.can_draft ? 'Draft' : ''} {g.can_approve ? 'Review & approve' : ''}
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void postJson(`/api/studio/works/${uid}/translations/access`, {
                        recipients: [g.uid],
                        locale: language,
                        can_draft: false,
                        can_approve: false,
                        remove: true,
                      })
                        .then(() => load())
                        .catch((e: unknown) => setError(errorMessage(e)))
                        .finally(() => setBusy(false));
                    }}
                  >
                    {t('ui.remove_c3812fc4')}
                  </Button>
                </Group>
              ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
