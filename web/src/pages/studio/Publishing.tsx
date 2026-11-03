import { useFeedback } from '../../components/Feedback.js';
import { ReleaseSchedulePicker } from './ReleaseSchedulePicker.js';
import type { ReleaseSchedule } from '../../shared/schedule.js';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  MultiSelect,
  Stack,
  Stepper,
  Text,
  Title,
} from '@mantine/core';
import type { PageProps } from '../../shared/contracts.js';
import type { Work } from '../../shared/studio.js';
import type { Details } from '../../shared/creative.js';
import type { ChangeDetails } from './Chapters.js';
import { Classification, Disclosures } from './Classification.js';
import { Audience } from './Audience.js';
import { Chapters } from './Chapters.js';
import { useI18n } from '../../localisation/index.js';
import { postJson, errorMessage } from '../../client/api.js';

export function Publishing({
  props,
  work,
  details,
  change,
  canEdit,
  busy,
  synopsis,
  editArt,
}: {
  props: PageProps;
  work: Work;
  details: Details;
  change: ChangeDetails;
  canEdit: boolean;
  busy: boolean;
  synopsis: ReactNode;
  editArt: (field: 'cover' | 'hero') => void;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [mature, setMature] = useState(props.studio?.publishing?.mature ?? false);
  const [language, setLanguage] = useState(props.studio?.publishing?.language ?? 'en');
  const status = props.studio?.lifecycle?.status ?? props.studio?.publishing?.status ?? 'ongoing';
  const [related, setRelated] = useState(props.studio?.publishing?.related ?? []);
  const [schedule, setSchedule] = useState<ReleaseSchedule | null>(
    props.studio?.publishing?.release_schedule ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [, setError] = useFeedback('error');
  // Unrelated chapter/metadata saves must not invalidate an already reviewed disclosure set.
  const disclosureIdentity = JSON.stringify(details.value.disclosures);
  useEffect(() => {
    setReviewed(false);
  }, [work.uid, disclosureIdentity]);
  useEffect(() => {
    setConfirmed(false);
  }, [work.revision, details.revision]);
  const completed = [
    !!work.synopsis.trim(),
    !!work.cover && !!work.hero,
    details.value.genres.length > 0,
    details.value.target_audience.minimum_age !== null ||
      details.value.target_audience.maximum_age !== null,
    reviewed,
    details.value.nodes.some(
      (n) =>
        n.kind === 'chapter' &&
        n.delete_after === null &&
        props.studio?.published_chapters.includes(n.uid),
    ),
  ];
  const labels = [
    'synopsis',
    'artwork',
    'classification',
    'audience',
    'disclosures',
    'chapters',
    'review',
  ];
  const common = { details, change, canEdit, busy };
  const allowed = props.permissions.includes('publish_story') && !!props.studio?.work?.can_share;
  async function submit(unpublish = false) {
    setSaving(true);
    setError('');
    try {
      const response = await postJson(
        `/api/studio/works/${work.uid}/${unpublish ? 'unpublish' : 'publish'}`,
        unpublish
          ? { revision: work.revision }
          : {
              revision: work.revision,
              details_revision: details.revision,
              language,
              status,
              mature,
              disclosures_reviewed: reviewed,
              related,
              release_schedule: schedule,
            },
      );
      if (response.redirect) window.location.assign(response.redirect);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Stack gap="lg">
      <Title order={2}>{t('publishing.title')}</Title>
      <Alert>{t('publishing.snapshot_notice')}</Alert>
      <Stepper active={step} onStepClick={setStep} size="sm" orientation="vertical">
        {labels.map((label, index) => (
          <Stepper.Step
            key={label}
            label={t(`publishing.step.${label}`)}
            icon={completed[index] ? '✓' : index + 1}
            completedIcon={completed[index] ? '✓' : index + 1}
            progressIcon={completed[index] ? '✓' : index + 1}
            description={
              index < 6 ? t(completed[index] ? 'publishing.saved' : 'publishing.required') : ''
            }
            color={completed[index] ? 'brand' : 'gray'}
          />
        ))}
      </Stepper>
      <section aria-label={t(`publishing.step.${labels[step] ?? 'review'}`)}>
        {step === 0 && synopsis}
        {step === 1 && (
          <Group>
            <Button disabled={!canEdit || busy} onClick={() => editArt('cover')}>
              {t('ui.edit_cover_image_8ee276bc')}
            </Button>
            <Button disabled={!canEdit || busy} onClick={() => editArt('hero')}>
              {t('ui.edit_hero_image_09a38790')}
            </Button>
          </Group>
        )}
        {step === 2 && <Classification key={details.revision} {...common} />}
        {step === 3 && <Audience key={details.revision} {...common} />}
        {step === 4 && (
          <Stack>
            <Disclosures key={details.revision} {...common} />
            <Checkbox
              checked={reviewed}
              disabled={!canEdit}
              onChange={(e) => setReviewed(e.currentTarget.checked)}
              label={t('publishing.disclosures_reviewed')}
            />
          </Stack>
        )}
        {step === 5 && <Chapters {...common} workUid={work.uid} />}
        {step === 6 && (
          <Stack maw={780}>
            <NativeSelect
              label={t('publishing.language')}
              value={language}
              onChange={(e) => setLanguage(e.currentTarget.value)}
              data={[
                { value: 'en', label: 'English' },
                { value: 'ja', label: '日本語' },
                { value: 'zh', label: '中文' },
                { value: 'es', label: 'Español' },
                { value: 'fr', label: 'Français' },
              ]}
              disabled={!canEdit}
            />
            <Text>
              {t('publishing.status')}: {t(`publishing.status.${status}`)}
            </Text>
            <MultiSelect
              label={t('publishing.related')}
              value={related}
              onChange={setRelated}
              maxValues={20}
              searchable
              data={(props.studio?.publishing_options ?? []).map((s) => ({
                value: s.uid,
                label: `${s.title} · ${s.author_name}`,
              }))}
              disabled={!canEdit}
            />
            <ReleaseSchedulePicker
              value={schedule}
              onChange={setSchedule}
              timezone={props.localisation.timezone}
              disabled={!canEdit}
            />
            {props.studio?.publishing && (
              <Button component="a" href={`/stories/${work.uid}`} variant="subtle">
                {t('publishing.view_public')}
              </Button>
            )}
            <Checkbox
              label={t('publishing.mature')}
              checked={mature}
              onChange={(e) => setMature(e.currentTarget.checked)}
              disabled={!canEdit}
            />
            <Text size="sm" c="dimmed">
              {t('publishing.mature_help')}
            </Text>
            <Checkbox
              label={t('publishing.confirm')}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.currentTarget.checked)}
              disabled={!allowed}
            />
            {!allowed && <Text>{t('publishing.permission')}</Text>}
            <Group>
              <Button
                disabled={!allowed || !completed.every(Boolean) || !confirmed || busy}
                loading={saving}
                onClick={() => void submit()}
              >
                {t('publishing.publish')}
              </Button>
              <Button
                variant="default"
                disabled={!props.studio?.publishing || !allowed || !confirmed || busy}
                loading={saving}
                onClick={() => void submit(true)}
              >
                {t('publishing.unpublish')}
              </Button>
            </Group>
          </Stack>
        )}
      </section>

      <Group justify="space-between">
        <Button variant="default" disabled={step === 0} onClick={() => setStep(step - 1)}>
          {t('publishing.previous')}
        </Button>
        <Button disabled={step === 6} onClick={() => setStep(step + 1)}>
          {t('publishing.next')}
        </Button>
      </Group>
    </Stack>
  );
}
