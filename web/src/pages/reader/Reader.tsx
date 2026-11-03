import {
  IconArrowLeft,
  IconArrowRight,
  IconSettings,
  IconCloudCheck,
  IconCloudUpload,
  IconCloudOff,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { WorkArt } from '../studio/WorkArt.js';
import { useSpeech } from './useSpeech.js';
import { useMeasurements } from './useMeasurements.js';
import { useAppearance } from '../../components/Appearance.js';
import { useEffect, useState } from 'react';
import {
  Alert,
  ActionIcon,
  Tooltip,
  Popover,
  Button,
  Drawer,
  Group,
  NativeSelect,
  Rating,
  Slider,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import type { PageProps } from '../../shared/contracts.js';
import { defaultReaderSettings, readerSettingsSchema } from '../../shared/reader.js';
import { RichDocument, plainText } from '../../editor/document.js';
import { orderedChapters } from '../studio/Chapters.js';
import { useI18n } from '../../localisation/index.js';
import { useReading } from './useReading.js';
import { Comments } from '../comments/Comments.js';
import { Reactions } from './Reactions.js';
export function Reader(props: PageProps) {
  const data = props.reader;
  if (!data) return null;
  return <ChapterReader props={props} data={data} />;
}
function ChapterReader({
  props,
  data,
}: {
  props: PageProps;
  data: NonNullable<PageProps['reader']>;
}) {
  const { t } = useI18n();
  const [settings, setSettings] = useState(defaultReaderSettings);
  const appearance = useAppearance();
  const themeColour =
    props.site?.themes[settings.theme].primary_colour ?? props.site?.primary_colour ?? '#24675a';
  useEffect(() => {
    appearance.previewTheme(settings.theme, themeColour);
  }, [settings.theme, themeColour]);
  const [opened, setOpened] = useState(false),
    [downloaded, setDownloaded] = useState(false),
    [working, setWorking] = useState(false),
    [message, setMessage] = useState('');
  const voice = useSpeech(plainText(data.body.document), data.body.language, settings.speed, () =>
    setMessage(t('reader.speech_failed')),
  );
  const speech = voice.status,
    available = voice.available;
  const reading = useReading(data.work, data.chapter.uid);
  const stats = useMeasurements(data, reading.value.position, reading.value.revision);
  const [headerHidden, setHeaderHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const scroll = () => {
      const next = window.scrollY;
      if (Math.abs(next - last) > 3) {
        setHeaderHidden(next > 32 && next > last);
        last = next;
      }
    };
    window.addEventListener('scroll', scroll, { passive: true });
    return () => window.removeEventListener('scroll', scroll);
  }, []);
  const chapters = orderedChapters(data.chapters),
    index = chapters.findIndex((n) => n.uid === data.chapter.uid),
    previous = chapters[index - 1],
    next = chapters[index + 1];
  const path = `/read/${data.work}/${data.chapter.uid}`;
  const words = Array.from(
    new Intl.Segmenter(data.body.language, { granularity: 'word' }).segment(
      plainText(data.body.document),
    ),
  ).filter((s) => s.isWordLike).length;
  const minutes = Math.max(1, Math.ceil(words / 225));
  useEffect(() => {
    try {
      const parsed = readerSettingsSchema.safeParse(
        JSON.parse(localStorage.getItem('artismaga:reader-settings') ?? 'null'),
      );
      if (parsed.success) setSettings(parsed.data);
    } catch {
      /* Optional device storage. */
    }
    void offline('status');
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('artismaga:reader-settings', JSON.stringify(settings));
    } catch {
      /* Optional. */
    }
  }, [settings]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        opened ||
        !(event.target instanceof HTMLElement) ||
        event.target.closest(
          'input,textarea,select,button,a,[contenteditable=true],[role=slider],[role=radio]',
        )
      )
        return;
      if (event.key === 'ArrowLeft' && previous) {
        event.preventDefault();
        window.location.assign(`/read/${data.work}/${previous.uid}`);
      }
      if (event.key === 'ArrowRight' && next) {
        event.preventDefault();
        window.location.assign(`/read/${data.work}/${next.uid}`);
      }
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [opened, previous?.uid, next?.uid]);
  async function offline(action: 'download' | 'clear' | 'status') {
    if (!('serviceWorker' in navigator)) {
      if (action !== 'status') setMessage(t('reader.offline_unavailable'));
      return;
    }
    setWorking(true);
    try {
      const registration =
        action === 'download'
          ? await navigator.serviceWorker.register('/reader-sw.js', { scope: '/' })
          : await navigator.serviceWorker.getRegistration('/');
      if (!registration) {
        setDownloaded(false);
        return;
      }
      await navigator.serviceWorker.ready;
      const worker = registration.active;
      if (!worker) throw Error();
      const result = await new Promise<{ ok: boolean; downloaded?: boolean }>((resolve, reject) => {
        const channel = new MessageChannel();
        const timer = window.setTimeout(() => reject(Error()), 20000);
        channel.port1.onmessage = (event: MessageEvent<unknown>) => {
          window.clearTimeout(timer);
          const parsed = event.data;
          if (
            !parsed ||
            typeof parsed !== 'object' ||
            !('ok' in parsed) ||
            typeof parsed.ok !== 'boolean'
          ) {
            reject(Error());
            return;
          }
          resolve({
            ok: parsed.ok,
            downloaded: 'downloaded' in parsed && parsed.downloaded === true,
          });
          channel.port1.close();
        };
        worker.postMessage(
          {
            action,
            path,
            images: [
              ...(props.reactions?.reactions.map((r) => r.image) ?? []),
              ...(data.chapter.cover ? [`/media/${data.chapter.cover}`] : []),
            ],
          },
          [channel.port2],
        );
      });
      if (!result.ok) throw Error();
      setDownloaded(action === 'clear' ? false : result.downloaded === true);
      if (action !== 'status')
        setMessage(t(action === 'download' ? 'reader.downloaded' : 'reader.cleared'));
    } catch {
      if (action !== 'status') setMessage(t('reader.offline_failed'));
    } finally {
      setWorking(false);
    }
  }
  const navigation = (
    <Group justify="center" gap="lg" role="navigation" aria-label={t('reader.navigation')}>
      {previous ? (
        <ActionIcon
          component="a"
          href={`/read/${data.work}/${previous.uid}`}
          variant="subtle"
          size="lg"
          aria-label={t('reader.previous')}
        >
          <IconArrowLeft />
        </ActionIcon>
      ) : (
        <ActionIcon disabled size="lg" aria-label={t('reader.previous')}>
          <IconArrowLeft />
        </ActionIcon>
      )}
      <Text>
        {index + 1}
        <span className="reader-counter-total">/{chapters.length}</span>
      </Text>
      {next ? (
        <ActionIcon
          component="a"
          href={`/read/${data.work}/${next.uid}`}
          variant="subtle"
          size="lg"
          aria-label={t('reader.next')}
        >
          <IconArrowRight />
        </ActionIcon>
      ) : (
        <ActionIcon disabled size="lg" aria-label={t('reader.next')}>
          <IconArrowRight />
        </ActionIcon>
      )}
    </Group>
  );
  const SyncIcon =
    reading.status === 'synced'
      ? IconCloudCheck
      : reading.status === 'pending'
        ? IconCloudUpload
        : reading.status === 'conflict' || reading.status === 'unavailable'
          ? IconAlertTriangle
          : IconCloudOff;
  const chapterHeading = (
    <>
      <Title order={1}>{data.chapter.title}</Title>
      {data.chapter.cover && data.chapter.synopsis && (
        <Text className="reader-chapter-synopsis" mt="md">
          {data.chapter.synopsis}
        </Text>
      )}
      <Text my="md">{t('reader.minutes', { count: minutes })}</Text>
    </>
  );
  return (
    <div className={`reader-page reader-${settings.theme}`}>
      <header
        className={`reader-toolbar ${headerHidden && !opened ? 'reader-toolbar-hidden' : ''}`}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" className="reader-header-story">
            <ActionIcon
              component="a"
              href={`/stories/${data.work}`}
              variant="subtle"
              size="lg"
              aria-label={t('reader.story')}
            >
              <IconArrowLeft size={20} />
            </ActionIcon>
            <Text truncate>{data.story_title}</Text>
            <Text className="reader-header-counter">
              {index + 1}
              <span className="reader-counter-total">/{chapters.length}</span>
            </Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            <Popover position="bottom-end" width={280}>
              <Popover.Target>
                <Tooltip label={t(`reader.sync.${reading.status}`)}>
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    aria-label={t(`reader.sync.${reading.status}`)}
                  >
                    <SyncIcon size={20} />
                  </ActionIcon>
                </Tooltip>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack>
                  <Text size="sm" role="status">
                    {t(`reader.sync.${reading.status}`)}
                  </Text>
                  {reading.status === 'conflict' && (
                    <Button onClick={() => void reading.useDevice()}>
                      {t('reader.use_device')}
                    </Button>
                  )}
                </Stack>
              </Popover.Dropdown>
            </Popover>
            <ActionIcon
              variant="subtle"
              size="lg"
              aria-label={t('reader.settings')}
              aria-expanded={opened}
              aria-controls="reader-settings"
              onClick={() => setOpened(true)}
            >
              <IconSettings size={20} />
            </ActionIcon>
          </Group>
        </Group>
      </header>
      {data.chapter.cover && (
        <section className="reader-chapter-hero" aria-label={data.chapter.title}>
          <WorkArt
            artwork={{
              cover_url: `/media/${data.chapter.cover}`,
              hero_url: `/media/${data.chapter.cover}`,
              palette: [],
            }}
          />
          <div className="reader-chapter-hero-copy" style={{ maxWidth: `${settings.width}ch` }}>
            {chapterHeading}
          </div>
        </section>
      )}
      <div className="reader-content" style={{ maxWidth: `${settings.width}ch` }}>
        {!data.chapter.cover && chapterHeading}
        <Stack my="lg" aria-label={t('reader.disclosures')}>
          {data.chapter.disclosures.map((key) => (
            <Alert key={key} title={t(`reader.disclosure.${key}`)} color="yellow">
              {t(`reader.notice.${key}`)}
            </Alert>
          ))}
        </Stack>
        <article
          id="reader-prose"
          lang={data.body.language}
          tabIndex={-1}
          aria-label={data.chapter.title}
          style={{
            fontSize: `${settings.size}px`,
            fontFamily: settings.font,
            lineHeight: settings.spacing,
          }}
        >
          <RichDocument document={data.body.document} />
        </article>
        <section className="reader-feedback" aria-label={t('reader.feedback')}>
          <Title order={2} size="h3" ta="center">
            {t('reader.feedback')}
          </Title>
          <Reactions
            counts={stats.reactions}
            configuration={props.reactions}
            selected={reading.value.reactions}
            disabled={!reading.canReact}
            onChange={(reactions) => reading.update({ reactions })}
          />
          <Stack gap="xs" align="center">
            <Text>{t('reader.rate')}</Text>
            <Rating
              value={reading.value.rating ?? 0}
              count={5}
              size="xl"
              allowClear
              color="yellow"
              readOnly={!reading.canRate}
              aria-label={t('reader.rate')}
              onChange={(rating) => reading.update({ rating })}
            />
          </Stack>
          {!reading.authenticated && (
            <Text>
              <a href="/login">{t('reader.login')}</a>
            </Text>
          )}
        </section>
        {navigation}
      </div>
      <Comments work={data.work} chapter={data.chapter.uid} />
      <Drawer
        id="reader-settings"
        opened={opened}
        onClose={() => setOpened(false)}
        position="right"
        title={t('reader.settings')}
        closeButtonProps={{ 'aria-label': t('reader.close') }}
      >
        <Stack>
          <Button loading={working} onClick={() => void offline(downloaded ? 'clear' : 'download')}>
            {t(downloaded ? 'reader.clear' : 'reader.download')}
          </Button>
          {message && (
            <Text size="sm" role="status">
              {message}
            </Text>
          )}
          <Text>{t('reader.size')}</Text>
          <Slider
            label={null}
            thumbLabel={t('reader.size')}
            min={14}
            max={32}
            value={settings.size}
            onChange={(size) => setSettings((s) => ({ ...s, size }))}
          />
          <NativeSelect
            label={t('reader.font')}
            value={settings.font}
            data={['serif', 'sans-serif', 'monospace'].map((value) => ({
              value,
              label: t(`reader.font.${value}`),
            }))}
            onChange={(event) => {
              const font = readerSettingsSchema.shape.font.parse(event.currentTarget.value);
              setSettings((s) => ({ ...s, font }));
            }}
          />
          <Text>{t('reader.spacing')}</Text>
          <Slider
            thumbLabel={t('reader.spacing')}
            min={1.2}
            max={2.4}
            step={0.1}
            value={settings.spacing}
            onChange={(spacing) => setSettings((s) => ({ ...s, spacing }))}
          />
          <Text>{t('reader.width')}</Text>
          <Slider
            thumbLabel={t('reader.width')}
            min={40}
            max={90}
            value={settings.width}
            onChange={(width) => setSettings((s) => ({ ...s, width }))}
          />
          <NativeSelect
            label={t('reader.theme')}
            value={settings.theme}
            data={['light', 'dark'].map((value) => ({ value, label: t(`reader.theme.${value}`) }))}
            onChange={(event) => {
              const theme = readerSettingsSchema.shape.theme.parse(event.currentTarget.value);
              setSettings((s) => ({ ...s, theme }));
            }}
          />
          <Title order={2} size="h4">
            {t('reader.speech')}
          </Title>
          <Text size="xs" c="dimmed">
            {t('reader.local_download')}
          </Text>
          {speech === 'loading' && <Text role="status">{t('reader.local_loading')}</Text>}
          <Group>
            <Button
              disabled={!available || speech === 'playing' || speech === 'loading'}
              onClick={voice.play}
            >
              {t(speech === 'paused' ? 'reader.resume' : 'reader.play')}
            </Button>
            <Button
              disabled={speech !== 'playing'}
              onClick={() => {
                voice.pause();
              }}
            >
              {t('reader.pause')}
            </Button>
            <Button disabled={speech === 'stopped'} onClick={voice.stop}>
              {t('reader.stop')}
            </Button>
          </Group>
          <Text>{t('reader.speed')}</Text>
          <Slider
            disabled={speech !== 'stopped'}
            thumbLabel={t('reader.speed')}
            min={0.5}
            max={2}
            step={0.1}
            value={settings.speed}
            onChange={(speed) => setSettings((s) => ({ ...s, speed }))}
          />
          <Text size="sm">{t('reader.keyboard')}</Text>
          <Text size="sm">{t('reader.privacy')}</Text>
        </Stack>
      </Drawer>
    </div>
  );
}
