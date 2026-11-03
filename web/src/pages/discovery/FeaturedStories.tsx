import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { PageProps } from '../../shared/contracts.js';
import type { Story } from '../../shared/discovery.js';
import { useI18n } from '../../localisation/index.js';
import { ReadingButton } from './ReadingButton.js';
import { MatureWarning, StoryCover } from './StoryCard.js';
export function FeaturedStories({ stories, props }: { stories: Story[]; props: PageProps }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [outgoing, setOutgoing] = useState<number | null>(null);
  const [direction, setDirection] = useState(1);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
  const [revealed, setRevealed] = useState<string[]>([]);
  const reduced = useReducedMotion() || props.appearance?.accessibility.reduced_motion;
  const move = (next: number, dir: number) => {
    setOutgoing(index);
    setDirection(dir);
    setIndex(next);
    elapsed.current = 0;
    setProgress(0);
  };
  useEffect(() => {
    if (outgoing === null) return;
    const timer = window.setTimeout(() => setOutgoing(null), 450);
    return () => window.clearTimeout(timer);
  }, [outgoing, index]);
  useEffect(() => {
    if (hovered || focused || reduced || stories.length < 2) return;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      elapsed.current += now - previous;
      previous = now;
      if (elapsed.current >= 7000) {
        setOutgoing(index);
        setDirection(1);
        setIndex((index + 1) % stories.length);
        elapsed.current = 0;
      }
      setProgress(elapsed.current / 7000);
    }, 40);
    return () => window.clearInterval(timer);
  }, [hovered, focused, reduced, stories.length, index]);
  const slide = (story: Story, leaving: boolean) => {
    const blurred =
      story.mature && props.discovery?.mature_content !== 'show' && !revealed.includes(story.uid);
    return (
      <div
        key={`${story.uid}-${leaving}`}
        className={`featured-panel ${leaving ? 'featured-leaving' : 'featured-current'} ${outgoing !== null && !reduced ? 'featured-animated' : ''}`}
        style={{ '--slide-direction': direction } as React.CSSProperties}
        aria-hidden={leaving || undefined}
        inert={leaving}
      >
        <div
          className={blurred ? 'mature-obscured discovery-cover-blurred' : undefined}
          inert={blurred}
        >
          <div
            className="featured-hero"
            style={{ backgroundImage: `url("/media/${story.hero}")` }}
            aria-hidden="true"
          />
          <div className="featured-slide">
            <StoryCover story={story} blurred={false} onReveal={() => {}} />
            <Stack justify="flex-start" gap={6}>
              <Title order={3}>
                <a href={`/stories/${story.uid}`}>{story.title}</a>
              </Title>
              {story.subtitle && (
                <Text className="featured-subtitle" c="dimmed">
                  {story.subtitle}
                </Text>
              )}
              <UnstyledButton className="author-link">{story.author_name}</UnstyledButton>
            </Stack>
          </div>
        </div>
        {!leaving && <ReadingButton story={story} props={props} />}
        {blurred && <MatureWarning onReveal={() => setRevealed((old) => [...old, story.uid])} />}
      </div>
    );
  };
  const story = stories[index % Math.max(1, stories.length)];
  return (
    <section className="story-shelf featured-shelf" aria-label={t('discovery.featured')}>
      {story ? (
        <div
          className="featured-carousel"
          role="region"
          aria-roledescription={t('discovery.carousel')}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
          }}
        >
          {outgoing !== null && stories[outgoing] && slide(stories[outgoing], true)}
          {slide(story, false)}
          {stories.length > 1 && (
            <>
              <ActionIcon
                className="featured-previous"
                size="lg"
                variant="default"
                aria-label={t('discovery.previous_feature')}
                onClick={() => move((index + stories.length - 1) % stories.length, -1)}
              >
                <IconChevronLeft />
              </ActionIcon>
              <ActionIcon
                className="featured-next"
                size="lg"
                variant="default"
                aria-label={t('discovery.next_feature')}
                onClick={() => move((index + 1) % stories.length, 1)}
              >
                <IconChevronRight />
              </ActionIcon>
              <div className="featured-progress" aria-hidden="true">
                {stories.map((item, i) => (
                  <span key={item.uid}>
                    <span
                      style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }}
                    />
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <Text c="dimmed">{t('discovery.empty')}</Text>
      )}
    </section>
  );
}
