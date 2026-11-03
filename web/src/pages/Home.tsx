import { IconChevronLeft } from '@tabler/icons-react';
import { genreArtwork } from '../shared/genre-artwork.js';
import { WorkArt } from './studio/WorkArt.js';
import { useEffect, useState } from 'react';
import { ActionIcon, Button, Group, Pagination, Stack, Title } from '@mantine/core';
import { z } from 'zod';
import { AnnouncementBanner } from '../components/Announcements.js';
import { announcementSchema } from '../shared/announcements.js';
import type { PageProps } from '../shared/contracts.js';
import type { Story } from '../shared/discovery.js';
import { useI18n } from '../localisation/index.js';
import { FeaturedStories } from './discovery/FeaturedStories.js';
import { GenreButton } from './discovery/GenreButton.js';
import { StoryShelf } from './discovery/StoryCard.js';

export function Home(props: PageProps) {
  const { t } = useI18n();
  const [stories, setStories] = useState(props.discovery?.stories ?? []);
  const [genrePage, setGenrePage] = useState(props.discovery?.catalogue_page ?? 1);
  const [subgenre, setSubgenre] = useState(props.discovery?.subgenre ?? '');
  const genre =
    props.page === 'genre'
      ? props.discovery?.genres.find((g) => g.key === props.section)
      : undefined;
  useEffect(() => {
    const sync = () => {
      const query = new URLSearchParams(window.location.search);
      setSubgenre(query.get('subgenre') ?? '');
      const value = Number(query.get('page') ?? '1');
      setGenrePage(Number.isInteger(value) && value >= 1 && value <= 5 ? value : 1);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  function select(value: string, page = 1) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('subgenre', value);
    else url.searchParams.delete('subgenre');
    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');
    window.history.pushState(null, '', url);
    setSubgenre(value);
    setGenrePage(page);
  }
  function hide(story: Story, author: boolean) {
    setStories((old) =>
      old.filter((s) => (author ? s.author !== story.author : s.uid !== story.uid)),
    );
  }
  const visible = genre
    ? stories.filter((s) =>
        s.details.genres.some(
          (g) => g.genre === genre.key && (!subgenre || g.subgenre === subgenre),
        ),
      )
    : stories;
  if (genre)
    return (
      <Stack>
        <section className="genre-hero" aria-label={genre.name}>
          <WorkArt
            artwork={{
              cover_url: '/assets/default-cover.svg',
              hero_url: genre.image
                ? `/media/${genre.image}`
                : (genreArtwork[genre.key]?.image ?? null),
              palette: genre.image_palette,
            }}
          />
          <Group gap="sm" wrap="nowrap" className="genre-heading">
            <ActionIcon
              component="a"
              href="/"
              variant="default"
              size="lg"
              aria-label={t('discovery.back')}
            >
              <IconChevronLeft size={20} />
            </ActionIcon>
            <Title>{genre.name}</Title>
          </Group>
          <Group
            className="subgenre-navigation"
            wrap="nowrap"
            aria-label={t('discovery.subgenres')}
          >
            <Button
              variant={!subgenre ? 'filled' : 'default'}
              component="a"
              href={`/discover/genres/${encodeURIComponent(genre.key)}`}
              onClick={(e) => {
                e.preventDefault();
                select('');
              }}
            >
              {t('discovery.all')}
            </Button>
            {props.discovery?.genres
              .filter((g) => g.parent === genre.key)
              .map((g) => (
                <Button
                  key={g.key}
                  variant={subgenre === g.key ? 'filled' : 'default'}
                  component="a"
                  href={`/discover/genres/${encodeURIComponent(genre.key)}?subgenre=${encodeURIComponent(g.key)}`}
                  onClick={(e) => {
                    e.preventDefault();
                    select(g.key);
                  }}
                >
                  {g.name}
                </Button>
              ))}
          </Group>
        </section>
        <StoryShelf
          title={t('discovery.stories')}
          stories={[...visible]
            .sort((a, b) => b.latest_chapter_release - a.latest_chapter_release)
            .slice((genrePage - 1) * 24, genrePage * 24)}
          props={props}
          onHide={hide}
        />
        {visible.length > 24 && (
          <Pagination
            total={Math.ceil(visible.length / 24)}
            value={genrePage}
            onChange={(value) => select(subgenre, value)}
          />
        )}
      </Stack>
    );
  return (
    <>
      {z
        .array(announcementSchema)
        .parse(props.announcements)
        .map((item) => (
          <AnnouncementBanner key={item.uid} item={item} />
        ))}
      {visible.some((s) => s.featured) && (
        <FeaturedStories stories={visible.filter((s) => s.featured)} props={props} />
      )}
      <section className="story-shelf" aria-label={t('discovery.genres')}>
        <div className="genre-grid">
          {props.discovery?.genres
            .filter((g) => g.parent === null)
            .map((g) => (
              <GenreButton key={g.key} genre={g} />
            ))}
        </div>
      </section>
      {props.user && (
        <StoryShelf
          title={t('discovery.continue')}
          continueReading
          stories={visible
            .filter((s) => props.discovery?.continue_reading[s.uid])
            .sort(
              (a, b) =>
                (props.discovery?.continue_reading[b.uid]?.updated_at ?? 0) -
                (props.discovery?.continue_reading[a.uid]?.updated_at ?? 0),
            )
            .slice(0, 12)}
          props={props}
          onHide={hide}
          empty={t('engagement.continue_empty')}
        />
      )}
      <StoryShelf
        title={t('discovery.popular')}
        stories={visible
          .filter((s) => (props.discovery?.scores[s.uid] ?? 0) > 0)
          .sort(
            (a, b) => (props.discovery?.scores[b.uid] ?? 0) - (props.discovery?.scores[a.uid] ?? 0),
          )
          .slice(0, 12)}
        props={props}
        onHide={hide}
        empty={t('engagement.popular_empty')}
      />
      <StoryShelf
        title={t('discovery.fresh')}
        stories={[...visible]
          .sort((a, b) => b.latest_chapter_release - a.latest_chapter_release)
          .slice(0, 12)}
        props={props}
        onHide={hide}
      />

      <StoryShelf
        title={t('discovery.completed')}
        stories={visible
          .filter((s) => s.status === 'completed')
          .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0))
          .slice(0, 12)}
        props={props}
        onHide={hide}
      />
    </>
  );
}
