import { useFeedback } from '../../components/Feedback.js';
// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { useEffect, useState } from 'react';
import {
  Card,
  Title,
  Text,
  NativeSelect,
  Stack,
  Button,
  Group,
  Checkbox,
  Textarea,
} from '@mantine/core';
import { z } from 'zod';
import { taxonomySchema } from '../../shared/creative.js';
import type { Details, Taxonomy } from '../../shared/creative.js';
import type { ChangeDetails } from './Chapters.js';
import { SearchTags } from '../../components/SearchTags.js';
import { errorMessage } from '../../client/api.js';
export function Classification({
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
  const { t, options } = useI18n();

  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [, setError] = useFeedback('error');
  const [genres, setGenres] = useState(details.value.genres);
  const [tags, setTags] = useState(details.value.tags);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/vocabulary', { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error('Vocabulary unavailable');
        return z.object({ settings: taxonomySchema }).parse(await r.json()).settings;
      })
      .then(setTaxonomy)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    return () => controller.abort();
  }, []);
  function choose(index: number, genre: string, subgenre: string | null = null) {
    setGenres((old) => {
      const next = [...old];
      if (genre) next[index] = { genre, subgenre };
      else next.splice(index, 1);
      return next;
    });
  }
  return (
    <Card>
      <Stack>
        <Title order={2}>{t('ui.genres_tags_ed3dbc9a')}</Title>
        <Text size="sm" c="dimmed">
          {t('ui.choose_up_to_two_genres_with_one_optional_subgen_5378ff82')}
        </Text>
        {[0, 1].map((index) => (
          <Group key={index} grow align="start">
            <NativeSelect
              label={`Genre ${index + 1}${index === 1 ? t('ui.optional_edbfc3dc') : ''}`}
              value={genres[index]?.genre ?? ''}
              disabled={!canEdit || !taxonomy || (index === 1 && !genres[0])}
              data={options([
                { value: '', label: t('ui.choose_a_genre_881c26ea') },
                ...(taxonomy?.value.genres
                  .filter(
                    (g) =>
                      g.parent === null && !genres.some((s, i) => i !== index && s.genre === g.key),
                  )
                  .map((g) => ({ value: g.key, label: g.name })) ?? []),
              ])}
              onChange={(e) => choose(index, e.currentTarget.value)}
            />
            <NativeSelect
              label={t('ui.subgenre_optional_50ebb76e')}
              disabled={!canEdit || !genres[index]}
              value={genres[index]?.subgenre ?? ''}
              data={options([
                { value: '', label: t('ui.no_subgenre_6bc6f838') },
                ...(taxonomy?.value.genres
                  .filter((g) => g.parent === genres[index]?.genre)
                  .map((g) => ({ value: g.key, label: g.name })) ?? []),
              ])}
              onChange={(e) =>
                choose(index, genres[index]?.genre ?? '', e.currentTarget.value || null)
              }
            />
          </Group>
        ))}
        <SearchTags
          label={t('ui.tags_1331275b')}
          maxTags={40}
          kind="tags"
          scope="allowed"
          value={tags}
          onChange={setTags}
          allowCustom={taxonomy?.value.allow_arbitrary_tags ?? false}
          disabled={!canEdit}
        />

        <Button
          disabled={!canEdit || !taxonomy}
          loading={busy}
          onClick={() =>
            void change({
              action: 'metadata',
              genres,
              tags,
              disclosures: details.value.disclosures,
            })
          }
        >
          {t('ui.save_genres_tags_ba54d92b')}
        </Button>
      </Stack>
    </Card>
  );
}
const disclosureFields = [
  ['gore', 'Gore', 'What degrees of gore does it contain and how is it depicted?'],
  ['self_harm', 'Suicide/Self-Harm', 'How does it depict these themes, and how in-depth is it?'],
  ['assault', 'Assault', 'Does this story contain depictions of assault?'],
  ['adult', 'Adult Content', 'Does this story contain depictions of adult or sexual themes?'],
] as const;
export function Disclosures({
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
  const { t, tx } = useI18n();

  const [value, setValue] = useState(details.value.disclosures);
  return (
    <Card maw={850}>
      <Stack>
        <Title order={2}>{t('ui.story_wide_content_disclosures_245f2a69')}</Title>
        <Text c="dimmed" size="sm">
          {t('ui.use_these_disclosures_when_the_majority_of_the_s_7905646b')}
        </Text>
        {disclosureFields.map(([key, label, help]) => (
          <Stack key={key} gap="sm">
            <Checkbox
              label={tx(label)}
              checked={value[key] !== null}
              disabled={!canEdit}
              onChange={(e) => setValue({ ...value, [key]: e.currentTarget.checked ? '' : null })}
            />
            {value[key] !== null && (
              <Textarea
                label={tx(help)}
                description={t('ui.explain_the_nature_and_depth_of_this_content_to__a6af1d77')}
                value={value[key] ?? ''}
                onChange={(e) => setValue({ ...value, [key]: e.currentTarget.value })}
                required
                maxLength={2000}
                minRows={3}
                disabled={!canEdit}
              />
            )}
          </Stack>
        ))}
        <Button
          disabled={!canEdit || Object.values(value).some((v) => v !== null && !v.trim())}
          loading={busy}
          onClick={() =>
            void change({
              action: 'metadata',
              genres: details.value.genres,
              tags: details.value.tags,
              disclosures: value,
            })
          }
        >
          {t('ui.save_content_disclosures_4c24d352')}
        </Button>
      </Stack>
    </Card>
  );
}
