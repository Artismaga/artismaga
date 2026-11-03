// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { useState } from 'react';
import {
  Card,
  Title,
  Text,
  Stack,
  Switch,
  TagsInput,
  Button,
  Group,
  TextInput,
  NativeSelect,
  ColorInput,
  Modal,
  Badge,
  ThemeIcon,
} from '@mantine/core';
import {
  IconSparkles,
  IconPlanet,
  IconHeart,
  IconSearch,
  IconBolt,
  IconGhost,
  IconCompass,
  IconMasksTheater,
  IconMoodSmile,
  IconWorld,
  IconBuilding,
  IconSun,
  IconBook,
} from '@tabler/icons-react';
import type { Genre, Taxonomy as TaxonomyModel } from '../../shared/creative.js';
import type { AssetRef } from '../../shared/studio.js';
import { ArtworkInput } from '../../components/ArtworkInput.js';
import { ApiForm } from '../../components/Form.js';
const icons = {
  sparkles: IconSparkles,
  planet: IconPlanet,
  heart: IconHeart,
  search: IconSearch,
  bolt: IconBolt,
  ghost: IconGhost,
  compass: IconCompass,
  masks: IconMasksTheater,
  smile: IconMoodSmile,
  world: IconWorld,
  building: IconBuilding,
  sun: IconSun,
  book: IconBook,
};
const image = (uid: string | null): AssetRef | null =>
  uid ? { uid, url: `/media/${uid}`, palette: [] } : null;
export function Taxonomy({ settings }: { settings: TaxonomyModel }) {
  const { t, options } = useI18n();

  const [value, setValue] = useState(settings.value);
  const [revision, setRevision] = useState(settings.revision);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Genre | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [uploading, setUploading] = useState(false);
  function create() {
    setIsNew(true);
    setEditing({
      key: '',
      name: '',
      parent: null,
      colour: '#7950b0',
      icon: 'book',
      image: null,
      hero: null,
    });
  }
  return (
    <Stack>
      <Card>
        <Title order={2}>{t('ui.genres_subgenres_tags_1f04c5af')}</Title>
        <Text size="sm" c="dimmed" mt="sm">
          {t('ui.a_shared_vocabulary_for_discovery_work_configura_b896c079')}
        </Text>
        <ApiForm
          api="/api/admin/taxonomy"
          label={t('ui.save_vocabulary_430ce8bb')}
          disabled={uploading}
          transform={() => ({ revision, value })}
          onSaved={(response) => {
            if (response.revision !== undefined) setRevision(response.revision);
          }}
        >
          <Switch
            label={t('ui.import_starter_genres_and_subgenres_01d2a103')}
            description={t('ui.enabled_by_default_saving_adds_missing_starter_e_9e5f0fff')}
            checked={value.premade_genres}
            onChange={(e) => setValue({ ...value, premade_genres: e.currentTarget.checked })}
            mt="lg"
          />
          <Switch
            label={t('ui.allow_authors_to_create_arbitrary_tags_273f8e14')}
            description={t('ui.tags_still_have_length_count_and_character_limit_c2a263b2')}
            checked={value.allow_arbitrary_tags}
            onChange={(e) => setValue({ ...value, allow_arbitrary_tags: e.currentTarget.checked })}
          />
          <Switch
            label={t('ui.include_the_premade_fiction_tag_library_76de5b2e')}
            description={t('ui.1_390_distinct_tags_covering_genres_themes_chara_719c5997')}
            checked={value.premade_tags}
            onChange={(e) => setValue({ ...value, premade_tags: e.currentTarget.checked })}
          />
          <TagsInput
            label={t('ui.additional_predefined_tags_c5f2c328')}
            description={t('ui.enter_tags_with_enter_or_comma_up_to_5_000_tags__06d30c1c')}
            value={value.tags}
            onChange={(tags) => setValue({ ...value, tags })}
            maxTags={5000}
            maxLength={64}
          />
        </ApiForm>
      </Card>
      <Card>
        <Group justify="space-between" mb="md">
          <TextInput
            label={t('ui.find_a_genre_or_subgenre_f097e521')}
            placeholder={t('ui.search_vocabulary_79ad970d')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            className="grow"
          />
          <Button onClick={create}>{t('ui.add_genre_subgenre_70e57f6d')}</Button>
        </Group>
        <Text size="xs" c="dimmed" mb="md">
          {t('ui.genre_edits_below_are_drafts_until_you_select_sa_4840f4a5')}
        </Text>
        <Stack gap="xs">
          {value.genres
            .filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
            .map((g) => {
              const Icon = icons[g.icon as keyof typeof icons] ?? IconBook;
              return (
                <Group key={g.key} justify="space-between" wrap="nowrap">
                  <Group gap="sm">
                    <ThemeIcon color={g.colour} variant="light">
                      <Icon size={18} />
                    </ThemeIcon>
                    <div>
                      <Text size="sm" fw={600}>
                        {g.name}
                      </Text>
                      {g.parent && (
                        <Text size="xs" c="dimmed">
                          {t('ui.text_92105f58')}
                          {value.genres.find((p) => p.key === g.parent)?.name}
                        </Text>
                      )}
                    </div>
                  </Group>
                  <Group gap="xs">
                    <Badge color={g.colour} variant="light">
                      {g.parent ? t('ui.subgenre_184a7109') : t('ui.genre_6da795a8')}
                    </Badge>
                    <Button
                      variant="subtle"
                      size="xs"
                      onClick={() => {
                        setIsNew(false);
                        setEditing({ ...g });
                      }}
                    >
                      {t('ui.configure_6defafa2')}
                    </Button>
                  </Group>
                </Group>
              );
            })}
        </Stack>
      </Card>
      <Modal
        opened={editing !== null}
        onClose={() => {
          if (!uploading) setEditing(null);
        }}
        title={isNew ? t('ui.add_genre_or_subgenre_8b73034a') : t('ui.configure_genre_1b60ca29')}
        size="lg"
        closeOnEscape={!uploading}
        closeOnClickOutside={!uploading}
        withCloseButton={!uploading}
      >
        {editing && (
          <Stack>
            <TextInput
              label={t('ui.stable_key_15a74a2e')}
              description={t('ui.lowercase_letters_digits_and_hyphens_used_in_wor_6db8b954')}
              value={editing.key}
              disabled={!isNew}
              onChange={(e) => setEditing({ ...editing, key: e.currentTarget.value })}
              maxLength={100}
            />
            <TextInput
              label={t('ui.name_dcd1d522')}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.currentTarget.value })}
              maxLength={64}
            />
            <NativeSelect
              label={t('ui.parent_genre_optional_cb3353c1')}
              value={editing.parent ?? ''}
              disabled={value.genres.some((g) => g.parent === editing.key)}
              data={options([
                { value: '', label: t('ui.top_level_genre_ff45d130') },
                ...value.genres
                  .filter((g) => g.parent === null && g.key !== editing.key)
                  .map((g) => ({ value: g.key, label: g.name })),
              ])}
              onChange={(e) => setEditing({ ...editing, parent: e.currentTarget.value || null })}
            />
            <Group grow>
              <ColorInput
                label={t('ui.genre_colour_f7808d86')}
                format="hex"
                value={editing.colour}
                onChange={(colour) => setEditing({ ...editing, colour })}
              />
              <NativeSelect
                label={t('ui.icon_a35abcd6')}
                value={editing.icon}
                data={options(Object.keys(icons))}
                onChange={(e) => setEditing({ ...editing, icon: e.currentTarget.value })}
              />
            </Group>
            <ArtworkInput
              label={t('ui.small_image_6c44600b')}
              purpose="genre_image"
              value={image(editing.image)}
              onChange={(asset) => setEditing({ ...editing, image: asset?.uid ?? null })}
              onBusyChange={setUploading}
            />
            <ArtworkInput
              label={t('ui.hero_image_ac30ef37')}
              purpose="genre_hero"
              value={image(editing.hero)}
              onChange={(asset) => setEditing({ ...editing, hero: asset?.uid ?? null })}
              onBusyChange={setUploading}
            />
            <Group justify="space-between">
              {!isNew && (
                <Button
                  color="red"
                  variant="subtle"
                  disabled={uploading || value.genres.some((g) => g.parent === editing.key)}
                  onClick={() => {
                    setValue({
                      ...value,
                      genres: value.genres.filter((g) => g.key !== editing.key),
                    });
                    setEditing(null);
                  }}
                >
                  {t('ui.remove_entry_d653a1c5')}
                </Button>
              )}
              <Button
                disabled={
                  uploading ||
                  !editing.name.trim() ||
                  !/^[a-z0-9-]+$/.test(editing.key) ||
                  (isNew && value.genres.some((g) => g.key === editing.key))
                }
                onClick={() => {
                  setValue({
                    ...value,
                    genres: isNew
                      ? [...value.genres, editing]
                      : value.genres.map((g) => (g.key === editing.key ? editing : g)),
                  });
                  setEditing(null);
                }}
              >
                {t('ui.apply_to_draft_162e0260')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
