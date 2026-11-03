// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { useState } from 'react';
import {
  Title,
  Text,
  Card,
  TextInput,
  Textarea,
  NativeSelect,
  Stack,
  Anchor,
  Badge,
  Image,
} from '@mantine/core';
import { IconArrowLeft, IconBook2 } from '@tabler/icons-react';
import { ApiForm, formText } from '../../components/Form.js';
import { ArtworkInput } from '../../components/ArtworkInput.js';
import type { AssetRef } from '../../shared/studio.js';
import type { PageProps } from '../../shared/contracts.js';
import { WorkArt } from './WorkArt.js';
export function CreateWork(props: PageProps) {
  const { t, options } = useI18n();

  const [coverBusy, setCoverBusy] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [cover, setCover] = useState<AssetRef | null>(null);
  const [hero, setHero] = useState<AssetRef | null>(null);
  const [title, setTitle] = useState('');
  const fallback = props.studio?.default_artwork;
  if (!fallback) return null;
  const artwork = {
    cover_url: cover?.url ?? fallback.cover_url,
    hero_url: hero?.url ?? null,
    palette: cover?.palette ?? fallback.palette,
  };
  return (
    <>
      <Anchor href="/studio" size="sm">
        <IconArrowLeft size={14} /> {t('ui.back_to_studio_881b9a17')}
      </Anchor>
      <div className="page-heading" style={{ marginTop: 24 }}>
        <Text className="eyebrow">{t('ui.begin_something_wonderful_79857739')}</Text>
        <Title order={1}>{t('ui.create_a_work_04cf56a0')}</Title>
        <Text c="dimmed" mt="sm">
          {t('ui.a_title_is_enough_to_begin_everything_else_can_g_21c8ae7d')}
        </Text>
      </div>
      <div className="settings-columns">
        <Card>
          <ApiForm
            api="/api/studio/works"
            label={t('ui.create_work_1eb24f30')}
            disabled={coverBusy || heroBusy}
            transform={(data) => ({
              title: formText(data, 'title'),
              subtitle: formText(data, 'subtitle'),
              synopsis: formText(data, 'synopsis'),
              work_type: 'book',
              cover: cover?.uid ?? null,
              hero: hero?.uid ?? null,
            })}
          >
            <NativeSelect
              label={t('ui.work_type_a026f597')}
              value="book"
              data={options([{ value: 'book', label: 'Book' }])}
              disabled
              description={t('ui.manga_comics_audio_and_interactive_works_are_pla_d3009cca')}
            />
            <TextInput
              name="title"
              label={t('ui.title_7e8cd205')}
              placeholder={t('ui.what_will_your_story_be_called_85f5f226')}
              required
              maxLength={160}
              onChange={(e) => setTitle(e.currentTarget.value)}
            />
            <TextInput
              name="subtitle"
              label={t('ui.subtitle_383cd6c0')}
              placeholder={t('ui.a_little_more_to_draw_readers_in_optional_04dd901d')}
              maxLength={240}
            />
            <Textarea
              name="synopsis"
              label={t('ui.synopsis_8eb37553')}
              description={t('ui.optional_for_now_introduce_your_world_in_up_to_1_c19ef93c')}
              minRows={4}
              maxLength={10000}
            />
            <ArtworkInput
              label={t('ui.cover_image_b62cee93')}
              purpose="cover"
              value={cover}
              onChange={setCover}
              onBusyChange={setCoverBusy}
              fallback={fallback.cover_url}
            />
            <Text size="xs" c="dimmed">
              {t('ui.skip_this_to_use_the_site_s_default_cover_it_can_225beadb')}
            </Text>
            <ArtworkInput
              label={t('ui.hero_image_ac30ef37')}
              purpose="hero"
              value={hero}
              onChange={setHero}
              onBusyChange={setHeroBusy}
            />
            <Text size="xs" c="dimmed">
              {t('ui.skip_this_for_a_soft_textured_hero_generated_fro_aaf208aa')}
            </Text>
          </ApiForm>
        </Card>
        <Stack>
          <Card className="creation-preview">
            <WorkArt artwork={artwork} />
            <div className="creation-preview-content">
              <Image
                src={artwork.cover_url}
                alt={t('ui.new_work_cover_preview_ebdc2136')}
                w={145}
                h={218}
                radius="md"
              />
              <Badge mt="lg" variant="light">
                {t('ui.private_draft_da71fe24')}
              </Badge>
              <Title order={2} mt="sm">
                {title || t('ui.an_unwritten_world_f091be4d')}
              </Title>
              <Text c="dimmed" size="sm" mt="sm">
                {t('ui.your_next_great_story_starts_here_304b239a')}
              </Text>
            </div>
          </Card>
          <Card>
            <IconBook2 className="brand-icon" />
            <Text fw={600} mt="md">
              {t('ui.your_draft_stays_yours_df18907e')}
            </Text>
            <Text c="dimmed" size="sm" mt="sm">
              {t('ui.new_works_are_private_only_you_site_administrato_eabe93d1')}
            </Text>
          </Card>
        </Stack>
      </div>
    </>
  );
}
