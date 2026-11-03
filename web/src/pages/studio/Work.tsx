import { StoryStatus } from './StoryStatus.js';
import { ReadingAnalytics } from './ReadingAnalytics.js';
import { useFeedback } from '../../components/Feedback.js';
import { Publishing } from './Publishing.js';
import { Audience } from './Audience.js';
import { Translations } from './Translations.js';
// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { pageTitle } from '../../shared/page-title.js';
import { useState, useEffect } from 'react';
import { z } from 'zod';
import type { DetailsCommand } from '../../shared/creative.js';
import { detailsSchema } from '../../shared/creative.js';
import { Chapters } from './Chapters.js';
import { Classification, Disclosures } from './Classification.js';
import { Collaborators } from './Collaborators.js';
import {
  Title,
  Text,
  Card,
  Group,
  Image,
  Badge,
  Tabs,
  UnstyledButton,
  Modal,
  TextInput,
  Button,
  Textarea,
  SimpleGrid,
  Stack,
  ActionIcon,
} from '@mantine/core';
import {
  IconChevronLeft,
  IconPencil,
  IconBook2,
  IconPhoto,
  IconBooks,
  IconChartBar,
  IconSettings,
  IconUsers,
} from '@tabler/icons-react';
import type { PageProps } from '../../shared/contracts.js';
import type { Work as WorkModel, AssetRef } from '../../shared/studio.js';
import { usePathTab } from '../../client/navigation.js';
import { ApiForm, formText } from '../../components/Form.js';
import { postJson, errorMessage } from '../../client/api.js';
import { ArtworkInput } from '../../components/ArtworkInput.js';
import { WorkArt } from './WorkArt.js';
const tabs = [
  'overview',
  'publishing',
  'chapters',
  'related',
  'analytics',
  'settings',
  'disclosures',
  'translations',
] as const;
type Editing = 'title' | 'subtitle' | 'cover' | 'hero';
function payload(work: WorkModel) {
  return {
    revision: work.revision,
    value: {
      title: work.title,
      subtitle: work.subtitle,
      synopsis: work.synopsis,
      work_type: work.work_type,
      cover: work.cover,
      hero: work.hero,
    },
  };
}

export function Work(props: PageProps) {
  const { t, date } = useI18n();

  const initial = props.studio?.work;
  const [work, setWork] = useState(initial?.work);
  const fallback = props.studio?.default_artwork;
  const [art, setArt] = useState(work ? props.studio?.artwork[work.uid] : undefined);
  const [active, setActive] = usePathTab(
    props.section === 'audience' ? 'overview' : props.section || 'overview',
    `/studio/${work?.uid ?? ''}`,
    tabs,
  );
  const [editing, setEditing] = useState<Editing | null>(null);
  const [text, setText] = useState('');
  const [image, setImage] = useState<AssetRef | null>(null);
  const [, setError] = useFeedback('error');
  const [, setNotice] = useFeedback('success');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [details, setDetails] = useState(
    props.studio?.details ?? detailsSchema.parse({ revision: 0, value: {} }),
  );
  useEffect(() => {
    document.title = pageTitle(props, active ?? 'overview', work?.title);
  }, [active, work?.title, props.siteName]);
  async function changeDetails(command: DetailsCommand): Promise<boolean> {
    if (!work) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/studio/works/${work.uid}/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: details.revision, command }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const failure = z.object({ error: z.string().optional() }).parse(body);
        throw Error(failure.error ?? 'Could not save work configuration');
      }
      const saved = z.object({ details: detailsSchema, revision: z.number().int() }).parse(body);
      setDetails(saved.details);
      setNotice('Work configuration saved.');
      setWork({ ...work, revision: saved.revision });
      return true;
    } catch (e: unknown) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!work || !initial || !art || !fallback) return null;
  const current = work;
  const currentArt = art;
  function edit(field: Editing) {
    setError('');
    setEditing(field);
    setText(field === 'title' ? current.title : field === 'subtitle' ? current.subtitle : '');
    const id = field === 'cover' ? current.cover : current.hero;
    setImage(
      id
        ? { uid: id, url: `/media/${id}`, palette: field === 'cover' ? currentArt.palette : [] }
        : null,
    );
  }
  async function save() {
    if (!editing) return;
    setBusy(true);
    setError('');
    try {
      const next = { ...current };
      if (editing === 'title' || editing === 'subtitle') next[editing] = text;
      else next[editing] = image?.uid ?? null;
      const response = await postJson(`/api/studio/works/${current.uid}`, payload(next));
      if (response.revision === undefined) throw new Error('Could not confirm the saved revision.');
      setWork({ ...next, revision: response.revision });
      if (editing === 'cover')
        setArt({
          ...currentArt,
          cover_url: image?.url ?? fallback!.cover_url,
          palette: image?.palette.length ? image.palette : fallback!.palette,
        });
      if (editing === 'hero') setArt({ ...currentArt, hero_url: image?.url ?? null });
      setEditing(null);
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const synopsisForm = (
    <Card>
      <Title order={2}>{t('ui.about_this_work_982db1f3')}</Title>
      {initial.can_edit ? (
        <ApiForm
          api={`/api/studio/works/${work.uid}`}
          label={t('ui.save_synopsis_e5e0eef5')}
          transform={(data) => ({
            ...payload(work),
            value: { ...payload(work).value, synopsis: formText(data, 'synopsis') },
          })}
          onSaved={(response, data) => {
            if (response.revision !== undefined)
              setWork({
                ...work,
                revision: response.revision,
                synopsis: formText(data, 'synopsis'),
              });
          }}
        >
          <Textarea
            name="synopsis"
            label={t('ui.synopsis_8eb37553')}
            defaultValue={work.synopsis}
            maxLength={10000}
            minRows={7}
            mt="lg"
          />
        </ApiForm>
      ) : (
        <Text mt="lg" style={{ whiteSpace: 'pre-wrap' }}>
          {work.synopsis || t('ui.a_synopsis_has_not_been_added_yet_f6f0f39b')}
        </Text>
      )}
    </Card>
  );
  return (
    <>
      <section
        className="work-header"
        aria-label={t('ui.work_identity_5560af99')}
        onClick={(event) => {
          if (initial.can_edit && event.target === event.currentTarget) edit('hero');
        }}
      >
        <WorkArt artwork={art} />
        <ActionIcon
          component="a"
          href="/studio"
          className="work-back"
          variant="default"
          aria-label={t('ui.studio_0aa91af2')}
        >
          <IconChevronLeft size={20} />
        </ActionIcon>
        {initial.can_edit && (
          <UnstyledButton
            className="hero-edit-button"
            onClick={() => edit('hero')}
            aria-label={t('ui.edit_hero_image_09a38790')}
          >
            <IconPhoto size={17} /> {t('ui.edit_hero_77f8cbfe')}
          </UnstyledButton>
        )}
        <div className="work-cover-wrap">
          {initial.can_edit ? (
            <UnstyledButton
              className="work-cover-edit"
              onClick={() => edit('cover')}
              aria-label={t('ui.edit_cover_image_8ee276bc')}
            >
              <Image
                src={art.cover_url}
                alt={`Cover for ${work.title}`}
                className="work-overview-cover"
              />
              <span>
                <IconPhoto size={17} /> {t('ui.change_cover_bb67353a')}
              </span>
            </UnstyledButton>
          ) : (
            <Image
              src={art.cover_url}
              alt={`Cover for ${work.title}`}
              className="work-overview-cover"
            />
          )}
        </div>
        <div className="work-title-block">
          <Group gap="xs" mb="sm">
            <Badge variant="light">
              {work.status === 'draft'
                ? t('ui.draft_ebf12ef4')
                : t(`publishing.status.${work.status}`)}
            </Badge>
            <Badge variant="light" color="gray">
              {t('ui.book_909cb811')}
            </Badge>
            {work.owner !== props.user?.uid && (
              <Badge variant="light">{t('ui.shared_with_you_b447129c')}</Badge>
            )}
          </Group>
          <Title order={1} aria-label={work.title}>
            {initial.can_edit ? (
              <UnstyledButton
                className="identity-edit"
                onClick={() => edit('title')}
                aria-label={t('ui.edit_title_176a4421')}
              >
                {work.title}
                <IconPencil size={18} />
              </UnstyledButton>
            ) : (
              work.title
            )}
          </Title>
          {initial.can_edit ? (
            <UnstyledButton
              className="identity-edit work-subtitle"
              onClick={() => edit('subtitle')}
              aria-label={t('ui.edit_subtitle_489dcf60')}
            >
              {work.subtitle || t('ui.add_a_subtitle_fe6a0b8d')}
              <IconPencil size={16} />
            </UnstyledButton>
          ) : (
            work.subtitle && (
              <Text c="var(--ink)" size="lg" mt="sm">
                {work.subtitle}
              </Text>
            )
          )}
          <Text size="xs" c="var(--ink)" mt="md">
            {t('work.last_edited', {
              date: date(work.updated_at, 'date'),
            })}{' '}
            {initial.can_edit ? t('ui.hover_or_select_the_title_and_artwork_to_edit_481ca4aa') : ''}
          </Text>
        </div>
      </section>

      <Tabs value={active} onChange={setActive} className="settings-tabs">
        <Tabs.List>
          {[
            ['overview', t('ui.overview_d4b1ea57'), IconBook2],
            ['publishing', t('publishing.title'), IconBook2],
            ['chapters', t('ui.chapters_9831375b'), IconBooks],
            ['translations', 'Translations', IconBook2],
            ['disclosures', t('ui.content_disclosures_f5ecb5e3'), IconBook2],
            ['related', t('ui.related_works_e2275a76'), IconUsers],
            ['analytics', t('ui.analytics_94c116ee'), IconChartBar],
            ['settings', t('ui.sharing_settings_d33d6db3'), IconSettings],
          ].map(([value, label, Icon]) => {
            const TabIcon = Icon as typeof IconBook2;
            return (
              <Tabs.Tab
                key={String(value)}
                value={String(value)}
                leftSection={<TabIcon size={17} />}
              >
                {String(label)}
              </Tabs.Tab>
            );
          })}
        </Tabs.List>
        <Tabs.Panel value="overview" pt="lg">
          <Stack gap="lg">
            {synopsisForm}
            <StoryStatus
              props={props}
              work={work.uid}
              canEdit={initial.can_share && initial.can_edit}
            />
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
              <Classification
                key={`classification-${details.revision}`}
                details={details}
                change={changeDetails}
                canEdit={initial.can_edit}
                busy={busy}
              />
              <Audience
                key={`audience-${details.revision}`}
                details={details}
                change={changeDetails}
                canEdit={initial.can_edit}
                busy={busy}
              />
            </SimpleGrid>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="publishing" pt="lg">
          <Publishing
            props={props}
            work={work}
            details={details}
            change={changeDetails}
            canEdit={initial.can_edit}
            busy={busy}
            synopsis={synopsisForm}
            editArt={edit}
          />
        </Tabs.Panel>
        <Tabs.Panel value="chapters" pt="lg">
          <Chapters
            workUid={work.uid}
            details={details}
            change={changeDetails}
            canEdit={initial.can_edit}
            busy={busy}
          />
        </Tabs.Panel>
        <Tabs.Panel value="translations" pt="lg">
          <Translations
            uid={work.uid}
            initial={props.studio?.translations ?? null}
            onRevision={(revision) =>
              setWork((current) => (current ? { ...current, revision } : current))
            }
          />
        </Tabs.Panel>
        <Tabs.Panel value="disclosures" pt="lg">
          <Disclosures
            key={details.revision}
            details={details}
            change={changeDetails}
            canEdit={initial.can_edit}
            busy={busy}
          />
        </Tabs.Panel>
        <Tabs.Panel value="related" pt="lg">
          <Empty
            title={t('ui.stories_that_belong_together_3e15880b')}
            text="Series, franchises, prequels and side stories will be linked here when relationship management is implemented."
          />
        </Tabs.Panel>
        <Tabs.Panel value="analytics" pt="lg">
          <ReadingAnalytics props={props} />
        </Tabs.Panel>
        <Tabs.Panel value="settings" pt="lg">
          <Card maw={780}>
            <Title order={2}>{t('ui.collaborators_439c0bdd')}</Title>
            {initial.can_share ? (
              <Collaborators
                uid={work.uid}
                shares={initial.shares}
                onChanged={() => window.location.reload()}
              />
            ) : (
              <Text size="sm">
                {t('ui.only_the_owner_or_a_site_administrator_can_manag_13258e62')}
              </Text>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>
      <Modal
        opened={editing !== null}
        closeOnEscape={!uploading && !busy}
        closeOnClickOutside={!uploading && !busy}
        withCloseButton={!uploading && !busy}
        onClose={() => {
          if (!uploading && !busy) setEditing(null);
        }}
        title={`Edit ${editing ?? 'work'}`}
        size={editing === 'hero' ? 'lg' : 'md'}
      >
        {editing === 'title' || editing === 'subtitle' ? (
          <TextInput
            label={editing === 'title' ? t('ui.title_7e8cd205') : t('ui.subtitle_383cd6c0')}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            required={editing === 'title'}
            maxLength={editing === 'title' ? 160 : 240}
            data-autofocus
          />
        ) : (
          editing && (
            <ArtworkInput
              label={
                editing === 'cover' ? t('ui.cover_image_b62cee93') : t('ui.hero_image_ac30ef37')
              }
              purpose={editing}
              value={image}
              onChange={setImage}
              onBusyChange={setUploading}
              {...(editing === 'cover' ? { fallback: fallback.cover_url } : {})}
            />
          )
        )}
        {(editing === 'cover' || editing === 'hero') && (
          <Text size="xs" c="dimmed" mt="sm">
            {t('ui.remove_the_image_to_use_e49e12d7')}{' '}
            {editing === 'cover'
              ? t('ui.the_site_s_default_cover_04983afc')
              : t('ui.a_textured_hero_generated_from_the_cover_colours_9625c1ff')}
            {t('ui.text_cdb4ee2a')}
          </Text>
        )}

        <Group mt="lg" justify="flex-end">
          <Button variant="default" disabled={uploading || busy} onClick={() => setEditing(null)}>
            {t('ui.cancel_19766ed6')}
          </Button>
          <Button
            loading={busy}
            disabled={uploading}
            onClick={() => {
              void save();
            }}
          >
            {t('ui.save_changes_dd0ae7a5')}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <Card className="studio-empty">
      <span className="soft-icon">
        <IconBooks size={25} />
      </span>
      <Title order={2} mt="lg">
        {title}
      </Title>
      <Text c="dimmed" mt="sm" maw={560}>
        {text}
      </Text>
    </Card>
  );
}
