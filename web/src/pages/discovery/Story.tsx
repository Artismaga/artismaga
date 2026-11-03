import { elapsedMonths } from '../../shared/engagement.js';
import { useFeedback } from '../../components/Feedback.js';
import { useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Image,
  NativeSelect,
  Pagination,
  Rating,
  Stack,
  Tabs,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import type { PageProps } from '../../shared/contracts.js';
import type { Story as StoryModel } from '../../shared/discovery.js';
import { useI18n } from '../../localisation/index.js';
import { orderedChapters } from '../studio/Chapters.js';
import { WorkArt } from '../studio/WorkArt.js';
import { StoryShelf } from './StoryCard.js';
import { AudiencePill } from './AudiencePill.js';
import { StoryMenu } from './StoryMenu.js';
import { ReadingButton } from './ReadingButton.js';
import { ReleaseSchedulePanel } from './ReleaseSchedulePanel.js';
export function Story(props: PageProps) {
  const { t, date } = useI18n();
  const story = props.discovery?.stories.find((s) => s.uid === props.section);
  const [sort, setSort] = useState('released');
  const [direction, setDirection] = useState('desc');
  const [page, setPage] = useState(1);
  const [revealed, setRevealed] = useState(false);
  const [, setError] = useFeedback('error');
  const [stories, setStories] = useState(props.discovery?.stories ?? []);
  if (!story) return null;
  const chapters = orderedChapters(story.details.nodes).filter(
    (node) => story.chapter_dates[node.uid]?.body_revision != null,
  );
  const months = elapsedMonths(story.latest_chapter_release, props.localisation.now);
  const numbered = chapters.map((node, index) => ({ node, number: index + 1 }));
  numbered.sort((a, b) => {
    const key = sort === 'updated' ? 'updated_at' : 'released_at';
    const delta =
      sort === 'number'
        ? a.number - b.number
        : (story.chapter_dates[a.node.uid]?.[key] ?? story.first_published) -
          (story.chapter_dates[b.node.uid]?.[key] ?? story.first_published);
    return (direction === 'asc' ? 1 : -1) * (delta || a.number - b.number);
  });
  const blurred = story.mature && props.discovery?.mature_content !== 'show' && !revealed;
  const artwork = {
    cover_url: `/media/${story.cover}`,
    hero_url: `/media/${story.hero}`,
    palette: [],
  };
  function hide(item: StoryModel, author: boolean) {
    setStories((old) =>
      old.filter((s) => (author ? s.author !== item.author : s.uid !== item.uid)),
    );
  }
  const genres = props.discovery?.genres ?? [];
  const tags = story.details.genres.flatMap((g) => [g.genre, ...(g.subgenre ? [g.subgenre] : [])]);
  return (
    <>
      <section
        className={`work-header public-story-header ${blurred ? 'public-story-blurred' : ''}`}
        aria-label={story.title}
      >
        <WorkArt artwork={artwork} />
        <ReadingButton story={story} props={props} />
        <StoryMenu
          story={story}
          props={props}
          blurred={blurred}
          onReveal={() => setRevealed(true)}
          onHide={hide}
          onError={setError}
          allowFeature
        />
        <ActionIcon
          component="a"
          href="/"
          className="work-back"
          variant="default"
          aria-label={t('discovery.back')}
          onClick={(e) => {
            if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
              e.preventDefault();
              window.history.back();
            }
          }}
        >
          <IconChevronLeft size={20} />
        </ActionIcon>
        <div className="work-cover-wrap">
          <Image src={artwork.cover_url} alt="" className="work-overview-cover" />
        </div>
        <div className="work-title-block">
          <Group gap="sm">
            <AudiencePill story={story} />
            <Title>{story.title}</Title>
          </Group>
          {story.subtitle && (
            <Text size="lg" mt="sm">
              {story.subtitle}
            </Text>
          )}
          <UnstyledButton className="author-link" mt="sm">
            {story.author_name}
          </UnstyledButton>
          <Group mt="md">
            <Badge>{t(`publishing.status.${story.status}`)}</Badge>
            <Badge variant="light">{story.language}</Badge>
            {story.mature && <Badge color="gray">{t('discovery.mature')}</Badge>}
          </Group>
        </div>
      </section>
      {blurred && (
        <Alert mt="md" title={t('discovery.mature')}>
          <Button onClick={() => setRevealed(true)}>{t('discovery.reveal')}</Button>
        </Alert>
      )}
      {story.status === 'hiatus' && (
        <Alert my="md">
          {story.hiatus_until
            ? story.hiatus_until < props.localisation.now
              ? t('lifecycle.overdue')
              : t('lifecycle.expected', { date: date(story.hiatus_until, 'date') })
            : t('lifecycle.hiatus')}
        </Alert>
      )}
      {story.status === 'ongoing' && months >= 4 && (
        <Alert my="md" color="yellow">
          {t(
            months >= 24
              ? 'lifecycle.inactive_years'
              : months >= 12
                ? 'lifecycle.inactive_year'
                : 'lifecycle.inactive_months',
            {
              count: months >= 12 ? Math.floor(months / 12) : months,
            },
          )}
        </Alert>
      )}
      <Group my="lg">
        <Text size="sm">
          {t('story.first_published')} {date(story.first_published, 'date')}
        </Text>
        <Text size="sm">
          {t('story.updated')} {date(story.updated_at, 'date')}
        </Text>
        <Badge variant="light">{t('story.chapter_count', { count: chapters.length })}</Badge>
      </Group>
      <div className="public-story-layout">
        <Stack>
          <Card>
            <Stack>
              <Group>
                <Rating
                  value={0}
                  fractions={2}
                  readOnly
                  color="yellow"
                  aria-label={t('story.unrated')}
                />
                <Text c="dimmed" size="sm">
                  {t('story.unrated')}
                </Text>
              </Group>
              <Text style={{ whiteSpace: 'pre-wrap' }}>{story.synopsis}</Text>
              <Group gap="xs">
                {tags.map((key) => {
                  const genre = genres.find((g) => g.key === key);
                  return (
                    <Badge
                      component="a"
                      href={`/discover/genres/${encodeURIComponent(genre?.parent ?? key)}${genre?.parent ? `?subgenre=${encodeURIComponent(key)}` : ''}`}
                      key={key}
                      variant="light"
                    >
                      {genre?.name ?? key}
                    </Badge>
                  );
                })}
                {story.details.tags.map((tag) => (
                  <Badge key={`tag:${tag}`} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </Group>
              <Title order={3}>{t('ui.content_disclosures_f5ecb5e3')}</Title>
              {Object.entries(story.details.disclosures).some(([, value]) => value !== null) ? (
                Object.entries(story.details.disclosures)
                  .filter(([, value]) => value !== null)
                  .map(([key, value]) => (
                    <div key={key}>
                      <Text fw={600} c="dimmed">
                        {t(`story.disclosure.${key}`)}
                      </Text>
                      <Text style={{ whiteSpace: 'pre-wrap' }}>{value}</Text>
                    </div>
                  ))
              ) : (
                <Text c="dimmed">{t('story.no_disclosures')}</Text>
              )}
            </Stack>
          </Card>
          {story.release_schedule && (
            <ReleaseSchedulePanel schedule={story.release_schedule} props={props} />
          )}
        </Stack>
        <Tabs defaultValue="chapters">
          <Tabs.List>
            {['chapters', 'reviews', 'related', 'similar'].map((tab) => (
              <Tabs.Tab key={tab} value={tab}>
                {t(`story.tab.${tab}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="chapters" pt="lg">
            <Stack>
              <Group grow>
                <NativeSelect
                  label={t('story.sort')}
                  value={sort}
                  data={['released', 'updated', 'number'].map((value) => ({
                    value,
                    label: t(`story.sort.${value}`),
                  }))}
                  onChange={(e) => {
                    setSort(e.currentTarget.value);
                    setPage(1);
                  }}
                />
                <NativeSelect
                  label={t('story.direction')}
                  value={direction}
                  data={['asc', 'desc'].map((value) => ({
                    value,
                    label: t(`story.direction.${value}`),
                  }))}
                  onChange={(e) => {
                    setDirection(e.currentTarget.value);
                    setPage(1);
                  }}
                />
              </Group>
              {numbered.slice((page - 1) * 10, page * 10).map(({ node, number }) => (
                <Card key={node.uid} className="public-chapter" withBorder>
                  {node.cover && (
                    <Image
                      className={`public-chapter-art ${blurred ? 'public-chapter-art-blurred' : ''}`}
                      src={`/media/${node.cover}`}
                      alt=""
                    />
                  )}
                  <Group justify="space-between" wrap="nowrap" className="public-chapter-copy">
                    <Stack gap={3}>
                      <Text size="xs" c="dimmed">
                        {t('story.chapter_number', { number })}
                        {node.parent &&
                          ` · ${story.details.nodes.find((n) => n.uid === node.parent)?.title ?? ''}`}
                      </Text>
                      <Title order={3} size="h4">
                        {story.chapter_dates[node.uid]?.body_revision != null ? (
                          <a href={`/read/${story.uid}/${node.uid}`}>{node.title}</a>
                        ) : (
                          node.title
                        )}
                      </Title>
                      {story.chapter_dates[node.uid]?.body_revision == null && (
                        <Text size="xs" c="dimmed">
                          {t('reader.unpublished')}
                        </Text>
                      )}
                      <Group gap="xs">
                        {node.disclosures.map((key) => (
                          <Badge key={key}>{t(`reader.disclosure.${key}`)}</Badge>
                        ))}
                      </Group>
                      {node.synopsis && (
                        <Text size="xs" lineClamp={1}>
                          {node.synopsis}
                        </Text>
                      )}
                      <Text size="xs" c="dimmed">
                        {date(
                          story.chapter_dates[node.uid]?.released_at ?? story.first_published,
                          'date',
                        )}
                      </Text>
                    </Stack>
                    <Stack gap="xs" align="flex-end">
                      <Rating
                        value={(() => {
                          const row = props.discovery?.chapter_stats.find(
                            (s) => s.chapter === node.uid,
                          );
                          return row?.ratings ? row.rating_sum / row.ratings : 0;
                        })()}
                        fractions={2}
                        readOnly
                        color="yellow"
                        size="xs"
                        aria-label={t('story.unrated')}
                      />
                      <Text size="xs" c="dimmed">
                        {t('engagement.views_count', {
                          count:
                            props.discovery?.chapter_stats.find((s) => s.chapter === node.uid)
                              ?.views ?? 0,
                        })}
                      </Text>
                    </Stack>
                  </Group>
                </Card>
              ))}
              {numbered.length > 10 && (
                <Pagination
                  total={Math.ceil(numbered.length / 10)}
                  value={page}
                  onChange={setPage}
                />
              )}
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="reviews" pt="lg">
            <Text c="dimmed">{t('story.reviews_pending')}</Text>
          </Tabs.Panel>
          <Tabs.Panel value="related" pt="lg">
            <StoryShelf
              title={t('story.tab.related')}
              stories={stories.filter((s) => story.related.includes(s.uid))}
              props={props}
              onHide={hide}
            />
            <StoryShelf
              title={t('story.by_author')}
              stories={stories.filter(
                (s) =>
                  s.author === story.author &&
                  s.uid !== story.uid &&
                  !story.related.includes(s.uid),
              )}
              props={props}
              onHide={hide}
            />
          </Tabs.Panel>
          <Tabs.Panel value="similar" pt="lg">
            <Text c="dimmed">{t('story.similar_help')}</Text>
            <StoryShelf
              title={t('story.tab.similar')}
              stories={stories.filter(
                (s) =>
                  s.uid !== story.uid &&
                  s.details.genres.some((g) =>
                    story.details.genres.some((v) => v.genre === g.genre),
                  ),
              )}
              props={props}
              onHide={hide}
            />
          </Tabs.Panel>
        </Tabs>
      </div>
    </>
  );
}
