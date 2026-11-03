import { Button, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { Story } from '../../shared/discovery.js';
import type { PageProps } from '../../shared/contracts.js';
import { readingStateSchema } from '../../shared/reader.js';
import { orderedChapters } from '../studio/Chapters.js';
import { useI18n } from '../../localisation/index.js';
export function ReadingButton({ story, props }: { story: Story; props: PageProps }) {
  const { t } = useI18n();
  const chapters = orderedChapters(story.details.nodes).filter(
    (n) => story.chapter_dates[n.uid]?.body_revision != null,
  );
  const remote = props.discovery?.continue_reading[story.uid];
  const [resume, setResume] = useState(remote?.chapter ?? null);
  useEffect(() => {
    let latest = remote?.updated_at ?? 0;
    let chosen = remote?.chapter ?? null;
    try {
      for (const chapter of chapters) {
        const raw: unknown = JSON.parse(
          localStorage.getItem(
            `artismaga:reading:${props.user?.uid ?? 'guest'}:${story.uid}:${chapter.uid}`,
          ) ?? 'null',
        );
        const value = readingStateSchema.safeParse(
          raw && typeof raw === 'object' && 'state' in raw ? raw.state : raw,
        );
        if (value.success && value.data.updated_at > latest) {
          latest = value.data.updated_at;
          chosen = chapter.uid;
        }
      }
    } catch {
      /* Device storage is optional. */
    }
    setResume(chosen);
  }, [story.uid, remote?.chapter, remote?.updated_at, props.user?.uid]);
  const number = chapters.findIndex((n) => n.uid === resume);
  const chapter = chapters[number >= 0 ? number : 0];
  if (!chapter) return null;
  return (
    <Button
      component="a"
      href={`/read/${story.uid}/${chapter.uid}`}
      className="story-reading-button"
    >
      {t(number >= 0 ? 'story.continue_reading' : 'story.start_reading')}
      {number >= 0 && (
        <Text component="span" size="xs" ml="xs" opacity={0.72}>
          {t('story.resume_chapter', { number: number + 1 })}
        </Text>
      )}
    </Button>
  );
}
