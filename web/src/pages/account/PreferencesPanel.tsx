// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { SearchTags } from '../../components/SearchTags.js';
import { useAppearance } from '../../components/Appearance.js';
import { useState } from 'react';
import {
  Card,
  Text,
  TextInput,
  NativeSelect,
  Switch,
  SimpleGrid,
  Divider,
  Paper,
  Group,
  Badge,
} from '@mantine/core';
import { ApiForm, formText } from '../../components/Form.js';
import type { Preferences } from '../../shared/settings.js';
import { languages, preferencesSchema, readingSchema } from '../../shared/settings.js';
import type { ApiResponse } from '../../shared/contracts.js';
export type PreferenceSection =
  'reading' | 'content' | 'notifications' | 'privacy' | 'accessibility';
const titles: Record<PreferenceSection, [string, string]> = {
  reading: [
    'A reader that feels like you',
    'Your appearance defaults, ready for the stories ahead.',
  ],
  content: [
    'Make room for what you love',
    'Language, time zone, and a little control over your recommendations.',
  ],
  notifications: ['Stay in the loop, on your terms', 'Choose the updates that matter to you.'],
  privacy: ['Your reading life is yours', 'Start private. Share when you choose.'],
  accessibility: ['Comfort comes first', 'Make this space work better for you.'],
};
const timezoneOptions = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
];
export function PreferencesPanel({
  section,
  value,
  revision,
  onSaved,
}: {
  section: PreferenceSection;
  value: Preferences;
  revision: number;
  onSaved: (next: Preferences, revision: number) => void;
}) {
  const { t, tx, options } = useI18n();

  const appearance = useAppearance();
  const [preview, setPreview] = useState(value.reading);
  const [exclusions, setExclusions] = useState({
    hidden_genres: value.content.hidden_genres,
    hidden_tags: value.content.hidden_tags,
    hidden_authors: value.content.hidden_authors,
    hidden_stories: value.content.hidden_stories,
  });
  let submitted = value;
  function payload(data: FormData): unknown {
    const text = (key: string) => formText(data, key);
    const checked = (key: string) => data.has(key);
    const number = (key: string) => Number(text(key));
    const next: Record<string, unknown> = { ...value };
    if (section === 'reading')
      next['reading'] = {
        theme: text('theme'),
        font_family: text('font_family'),
        font_size: number('font_size'),
        line_height: number('line_height'),
        content_width: number('content_width'),
        speech_speed: number('speech_speed'),
        offline_enabled: checked('offline_enabled'),
      };
    if (section === 'content')
      next['content'] = {
        automatic_translations: checked('automatic_translations'),
        language: text('language'),
        timezone: text('timezone'),
        mature_content: text('mature_content'),
        show_warnings: checked('show_warnings'),
        hidden_genres: exclusions.hidden_genres,
        hidden_tags: exclusions.hidden_tags,
        hidden_authors: exclusions.hidden_authors,
        hidden_stories: exclusions.hidden_stories,
      };
    if (section === 'notifications')
      next['notifications'] = {
        ...value.notifications,
        in_app: checked('in_app'),
        email: checked('email'),
        frequency: text('frequency'),
        new_chapters: checked('new_chapters'),
        chapter_edits: checked('chapter_edits'),
        new_stories: checked('new_stories'),
        author_updates: checked('author_updates'),
        hiatus_returns: checked('hiatus_returns'),
        replies: checked('replies'),
        mentions: checked('mentions'),
        reviews: checked('reviews'),
        reactions: checked('reactions'),
      };
    if (section === 'privacy')
      next['privacy'] = {
        public_profile: checked('public_profile'),
        public_activity: checked('public_activity'),
        private_library: checked('private_library'),
        private_history: checked('private_history'),
        list_visibility: text('list_visibility'),
        review_visibility: text('review_visibility'),
      };
    if (section === 'accessibility')
      next['accessibility'] = {
        reduced_motion: checked('reduced_motion'),
        high_contrast: checked('high_contrast'),
        large_controls: checked('large_controls'),
        screen_reader_announcements: checked('screen_reader_announcements'),
        keyboard_navigation: checked('keyboard_navigation'),
      };
    submitted = preferencesSchema.parse(next);
    return { revision, preferences: submitted };
  }
  const toggle = (name: string, label: string, description: string, checked: boolean) => (
    <Switch
      key={name}
      name={name}
      label={tx(label)}
      description={tx(description)}
      defaultChecked={checked}
      size="md"
      className="setting-switch"
    />
  );
  const [title, description] = titles[section];
  return (
    <div className={section === 'reading' ? 'settings-columns' : 'settings-single'}>
      <Card>
        <Text fw={650} size="lg">
          {tx(title)}
        </Text>
        <Text size="sm" c="dimmed" mt="xs" mb="lg">
          {tx(description)}
        </Text>
        <ApiForm
          api="/api/account/preferences"
          label={t('ui.save_preferences_089e57e3')}
          transform={payload}
          onChange={(event) => {
            if (section !== 'reading' && section !== 'accessibility') return;
            try {
              payload(new FormData(event.currentTarget));
              appearance.update(
                section === 'reading'
                  ? { reading: submitted.reading }
                  : { accessibility: submitted.accessibility },
              );
            } catch {
              /* Incomplete numeric input is not an appearance value yet. */
            }
          }}
          onSaved={(response: ApiResponse) => {
            if (response.revision !== undefined) onSaved(submitted, response.revision);
          }}
        >
          {section === 'reading' && (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <NativeSelect
                  name="theme"
                  label={t('ui.colour_theme_8484a1d6')}
                  defaultValue={value.reading.theme}
                  data={options(
                    [
                      { value: 'light', label: t('ui.light_dbcd5e7b') },
                      { value: 'dark', label: t('ui.dark_60acc53f') },
                      { value: 'sepia', label: t('ui.sepia_7464e26f') },
                      { value: 'system', label: t('ui.match_device_5e4aca65') },
                    ].filter((option) => appearance.availableThemes.includes(option.value)),
                  )}
                />
                <NativeSelect
                  name="font_family"
                  label={t('ui.reading_font_13ef73c4')}
                  defaultValue={value.reading.font_family}
                  data={options([
                    { value: 'serif', label: t('ui.classic_serif_9906958b') },
                    { value: 'sans', label: t('ui.clean_sans_serif_02ae9aa2') },
                    { value: 'dyslexic', label: t('ui.spacious_sans_serif_613b0ee6') },
                  ])}
                  onChange={(e) =>
                    setPreview({
                      ...preview,
                      font_family: readingSchema.shape.font_family.parse(e.currentTarget.value),
                    })
                  }
                />
                <TextInput
                  type="number"
                  name="font_size"
                  label={t('ui.font_size_px_f5c080f4')}
                  min={14}
                  max={30}
                  defaultValue={value.reading.font_size}
                  required
                  onChange={(e) =>
                    setPreview({ ...preview, font_size: Number(e.currentTarget.value) })
                  }
                />
                <TextInput
                  type="number"
                  name="line_height"
                  label={t('ui.line_spacing_0db45da1')}
                  min={1.2}
                  max={2.4}
                  step={0.1}
                  defaultValue={value.reading.line_height}
                  required
                  onChange={(e) =>
                    setPreview({ ...preview, line_height: Number(e.currentTarget.value) })
                  }
                />
                <TextInput
                  type="number"
                  name="content_width"
                  label={t('ui.content_width_px_eb2750f2')}
                  min={480}
                  max={1100}
                  step={10}
                  defaultValue={value.reading.content_width}
                  required
                />
                <TextInput
                  type="number"
                  name="speech_speed"
                  label={t('ui.text_to_speech_speed_41944b20')}
                  min={0.5}
                  max={2}
                  step={0.1}
                  defaultValue={value.reading.speech_speed}
                  required
                />
              </SimpleGrid>
              <Divider />
              {toggle(
                'offline_enabled',
                t('ui.prefer_offline_reading_8ebd6b2d'),
                t('ui.saved_for_when_downloads_and_the_offline_reader__4ff9ec93'),
                value.reading.offline_enabled,
              )}
              <Text size="xs" c="dimmed">
                {t('ui.theme_changes_apply_immediately_save_to_keep_the_fdd27155')}
              </Text>
            </>
          )}
          {section === 'content' && (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <NativeSelect
                  name="language"
                  label={t('ui.preferred_language_140071fe')}
                  data={options(languages)}
                  defaultValue={value.content.language}
                />
                <NativeSelect
                  name="timezone"
                  label={t('ui.time_zone_b9fe1464')}
                  data={options(Array.from(new Set([...timezoneOptions, value.content.timezone])))}
                  defaultValue={value.content.timezone}
                />
              </SimpleGrid>
              <NativeSelect
                name="mature_content"
                label={t('ui.mature_content_in_discovery_49b4ef32')}
                defaultValue={value.content.mature_content}
                data={options([
                  { value: 'hide', label: t('ui.hide_mature_stories_324786de') },
                  { value: 'blur', label: t('ui.show_with_a_notice_1352d4c3') },
                  { value: 'show', label: t('ui.show_mature_stories_24aa1298') },
                ])}
              />
              {toggle(
                'show_warnings',
                t('ui.always_show_content_warnings_14889d01'),
                t('ui.keep_a_warning_before_chapters_with_sensitive_ma_d6f49516'),
                value.content.show_warnings,
              )}
              <Switch
                name="automatic_translations"
                label={t('ui.show_automatic_translations_of_user_created_cont_c4159ff7')}
                description={t('ui.turn_off_to_always_read_original_user_created_te_e6bf50fa')}
                defaultChecked={value.content.automatic_translations}
              />
              <Divider />
              <Text fw={600} size="sm">
                {t('ui.recommendation_exclusions_7f72d485')}
              </Text>
              <Text size="xs" c="dimmed">
                {t('ui.search_the_site_s_genres_subgenres_tags_public_s_402beaac')}
              </Text>
              {(['hidden_genres', 'hidden_tags', 'hidden_authors', 'hidden_stories'] as const).map(
                (key) => (
                  <SearchTags
                    key={key}
                    kind={key.slice(7) as 'genres' | 'tags' | 'authors' | 'stories'}
                    value={exclusions[key]}
                    onChange={(next) => setExclusions((previous) => ({ ...previous, [key]: next }))}
                    label={
                      {
                        hidden_genres: t('ui.genres_to_hide_04976fe6'),
                        hidden_tags: t('ui.tags_to_hide_09651b21'),
                        hidden_authors: t('ui.authors_to_hide_bb860dd7'),
                        hidden_stories: t('ui.stories_to_hide_90b217ef'),
                      }[key]
                    }
                  />
                ),
              )}
            </>
          )}
          {section === 'notifications' && (
            <>
              {toggle(
                'in_app',
                t('ui.in_site_notifications_e47758c5'),
                t('ui.keep_your_updates_together_in_a_future_notificat_162757df'),
                value.notifications.in_app,
              )}
              {toggle(
                'email',
                t('ui.email_notifications_aab79ba9'),
                t('ui.requires_site_email_delivery_and_notification_fe_bc400253'),
                value.notifications.email,
              )}
              <NativeSelect
                name="frequency"
                label={t('ui.email_frequency_cc009fae')}
                defaultValue={value.notifications.frequency}
                data={options([
                  { value: 'immediate', label: t('ui.as_they_happen_4644506d') },
                  { value: 'daily', label: t('ui.daily_digest_8099c761') },
                  { value: 'weekly', label: t('ui.weekly_digest_b134b14f') },
                  { value: 'disabled', label: t('ui.no_email_digest_4cd3ef47') },
                ])}
              />
              <Divider />
              {(
                [
                  [
                    'new_chapters',
                    t('ui.new_chapters_44ee967f'),
                    t('ui.a_new_chapter_in_a_followed_story_51d1d5b6'),
                  ],
                  [
                    'chapter_edits',
                    t('ui.chapter_edits_d21e5fbb'),
                    t('ui.separate_updates_for_changes_to_a_published_chap_e9a0f197'),
                  ],
                  [
                    'new_stories',
                    t('ui.new_stories_b6854f4d'),
                    t('ui.a_new_work_from_an_author_you_follow_a9f41e14'),
                  ],
                  [
                    'author_updates',
                    t('ui.author_announcements_897b34dc'),
                    t('ui.news_from_your_favourite_voices_360268c0'),
                  ],
                  [
                    'hiatus_returns',
                    t('ui.a_story_returns_5d4e52af'),
                    t('ui.a_followed_story_resumes_after_a_break_5ac779a5'),
                  ],
                  [
                    'replies',
                    t('ui.replies_31ecb5e0'),
                    t('ui.someone_replies_to_your_contribution_92b36bde'),
                  ],
                  ['mentions', t('ui.mentions_6f32e692'), t('ui.someone_mentions_you_b6a525a1')],
                  ['reviews', t('ui.reviews_84cb7871'), t('ui.a_review_of_your_work_92416193')],
                  [
                    'reactions',
                    t('ui.reactions_8a7ede6b'),
                    t('ui.likes_and_other_reactions_d5446096'),
                  ],
                ] as const
              ).map(([key, label, hint]) => toggle(key, label, hint, value.notifications[key]))}
              <Text size="xs" c="dimmed">
                {t('ui.preferences_are_saved_now_delivery_begins_as_the_7177de38')}
              </Text>
            </>
          )}
          {section === 'privacy' && (
            <>
              {toggle(
                'public_profile',
                t('ui.public_profile_eaad68e1'),
                t('ui.allow_a_future_public_profile_to_be_visible_to_o_f16f5198'),
                value.privacy.public_profile,
              )}
              {toggle(
                'public_activity',
                t('ui.public_activity_c3ecc6e4'),
                t('ui.share_future_reading_activity_on_your_profile_f32e51a6'),
                value.privacy.public_activity,
              )}
              {toggle(
                'private_library',
                t('ui.keep_my_library_private_a8585691'),
                t('ui.your_saved_books_and_shelves_start_private_cd5acb68'),
                value.privacy.private_library,
              )}
              {toggle(
                'private_history',
                t('ui.keep_my_reading_history_private_e77c2168'),
                t('ui.your_reading_history_starts_private_d0502cc4'),
                value.privacy.private_history,
              )}
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <NativeSelect
                  name="list_visibility"
                  label={t('ui.new_reading_lists_d4bd3bb6')}
                  defaultValue={value.privacy.list_visibility}
                  data={options(['private', 'public'])}
                />
                <NativeSelect
                  name="review_visibility"
                  label={t('ui.future_review_visibility_caa761c7')}
                  defaultValue={value.privacy.review_visibility}
                  data={options(['private', 'public'])}
                />
              </SimpleGrid>
              <Switch
                name="automatic_translations"
                label={t('ui.show_automatic_translations_of_user_created_cont_c4159ff7')}
                description={t('ui.turn_off_to_always_read_original_user_created_te_e6bf50fa')}
                defaultChecked={value.content.automatic_translations}
              />
              <Divider />
              <Text fw={600}>{t('ui.blocked_and_muted_accounts_58169b9e')}</Text>
              <Text size="sm" c="dimmed">
                {t('ui.controls_will_appear_here_when_public_profiles_a_73f138ad')}
              </Text>
            </>
          )}
          {section === 'accessibility' && (
            <>
              {toggle(
                'reduced_motion',
                t('ui.reduce_motion_297ef4c7'),
                t('ui.stop_skeleton_animation_and_nonessential_transit_c2320158'),
                value.accessibility.reduced_motion,
              )}
              {toggle(
                'high_contrast',
                t('ui.higher_contrast_9d69da96'),
                t('ui.strengthen_text_borders_and_focus_indicators_fe6184c2'),
                value.accessibility.high_contrast,
              )}
              {toggle(
                'large_controls',
                t('ui.larger_controls_ef13c7cd'),
                t('ui.give_buttons_and_inputs_more_room_e1867aca'),
                value.accessibility.large_controls,
              )}
              {toggle(
                'screen_reader_announcements',
                t('ui.screen_reader_announcements_162a95d0'),
                t('ui.saved_for_reader_progress_and_navigation_announc_c1fc979a'),
                value.accessibility.screen_reader_announcements,
              )}
              {toggle(
                'keyboard_navigation',
                t('ui.reader_keyboard_navigation_419382f0'),
                t('ui.saved_for_future_chapter_navigation_shortcuts_51505366'),
                value.accessibility.keyboard_navigation,
              )}
              <Text size="xs" c="dimmed">
                {t('ui.visual_accessibility_choices_apply_immediately_s_095229c3')}
              </Text>
            </>
          )}
        </ApiForm>
      </Card>
      {section === 'reading' && (
        <Card className="reading-preview">
          <Group justify="space-between">
            <Text size="xs" className="eyebrow">
              {t('ui.a_little_preview_22fca0a4')}
            </Text>
            <Badge variant="light" color="gray">
              {t('ui.sample_text_3a2c5c49')}
            </Badge>
          </Group>
          <Paper
            className="reading-sample"
            mt="lg"
            p="lg"
            style={{
              fontFamily:
                preview.font_family === 'serif'
                  ? t('ui.georgia_serif_36fb5cfb')
                  : t('ui.system_ui_sans_serif_bd10b21d'),
              fontSize: Math.min(30, Math.max(14, preview.font_size || 18)),
              lineHeight: Math.min(2.4, Math.max(1.2, preview.line_height || 1.8)),
              letterSpacing: preview.font_family === 'dyslexic' ? '.035em' : undefined,
            }}
          >
            <Text component="h2" inherit fw={600} mb="md">
              {t('ui.beyond_the_last_lantern_406feed7')}
            </Text>
            {t('ui.the_path_had_always_ended_at_the_old_gate_tonigh_95118452')}
            <br />
            <br />
            {t('ui.mara_held_the_lantern_a_little_higher_and_took_o_36e7a722')}
          </Paper>
          <Text size="xs" c="dimmed" mt="md">
            {t('ui.a_place_to_find_your_comfortable_reading_rhythm_aeabbc80')}
          </Text>
        </Card>
      )}
    </div>
  );
}
