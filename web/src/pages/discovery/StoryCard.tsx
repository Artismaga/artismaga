import { useFeedback } from '../../components/Feedback.js';
import { useState, type ReactNode } from 'react';
import { Badge, Button, Group, Image, Text, Title, UnstyledButton, Progress } from '@mantine/core';
import type { Story } from '../../shared/discovery.js';
import type { PageProps } from '../../shared/contracts.js';
import { useI18n } from '../../localisation/index.js';
import { AudiencePill } from './AudiencePill.js';
import { StoryMenu } from './StoryMenu.js';
export function MatureWarning({ onReveal }: { onReveal: () => void }) {
  const { t } = useI18n();
  return (
    <div className="mature-warning">
      <Text fw={700}>{t('discovery.mature')}</Text>
      <Button size="xs" onClick={onReveal}>
        {t('discovery.reveal')}
      </Button>
    </div>
  );
}
export function StoryCover({
  story,
  blurred,
  onReveal,
  children,
  href,
}: {
  story: Story;
  blurred: boolean;
  onReveal: () => void;
  children?: ReactNode;
  href?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="discovery-story-art">
      <a href={href ?? `/stories/${story.uid}`} tabIndex={-1} aria-hidden="true">
        <Image
          src={`/media/${story.cover}`}
          alt=""
          className={`discovery-cover ${blurred ? 'discovery-cover-blurred' : ''}`}
        />
      </a>
      {story.mature && (
        <div className="cover-mature">
          {blurred ? (
            <UnstyledButton onClick={onReveal} aria-label={t('discovery.reveal')}>
              <Badge color="orange">{t('discovery.mature')}</Badge>
            </UnstyledButton>
          ) : (
            <Badge color="orange">{t('discovery.mature')}</Badge>
          )}
        </div>
      )}
      <Group className="cover-pills" gap={5}>
        <Badge>{t(`publishing.status.${story.status}`)}</Badge>
        <AudiencePill story={story} />
      </Group>
      {children}
    </div>
  );
}
export function StoryCard({
  story,
  props,
  onHide,
  continueReading = false,
}: {
  story: Story;
  props: PageProps;
  onHide: (story: Story, author: boolean) => void;
  continueReading?: boolean;
}) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  const [, setError] = useFeedback('error');
  const resume = continueReading ? props.discovery?.continue_reading[story.uid] : undefined;
  const destination = resume ? `/read/${story.uid}/${resume.chapter}` : `/stories/${story.uid}`;
  const blurred = story.mature && props.discovery?.mature_content !== 'show' && !revealed;
  return (
    <article className="discovery-story">
      <div
        className={blurred ? 'mature-obscured discovery-cover-blurred' : undefined}
        inert={blurred}
      >
        <StoryCover
          story={story}
          href={destination}
          blurred={blurred}
          onReveal={() => setRevealed(true)}
        >
          {resume && (
            <Progress
              className="continue-progress"
              value={resume.position * 100}
              aria-label={t('engagement.progress')}
              radius={0}
            />
          )}
        </StoryCover>
        <Title order={3} size="sm" mt="sm">
          <a href={destination}>{story.title}</a>
        </Title>
        {story.subtitle && (
          <Text size="xs" c="dimmed" mt={3} lineClamp={2}>
            {story.subtitle}
          </Text>
        )}
      </div>
      {blurred && <MatureWarning onReveal={() => setRevealed(true)} />}
      <StoryMenu
        story={story}
        props={props}
        blurred={blurred}
        onReveal={() => setRevealed(true)}
        onHide={onHide}
        onError={setError}
      />
    </article>
  );
}
export function StoryShelf({
  title,
  stories,
  props,
  onHide,
  empty,
  continueReading = false,
}: {
  title: string;
  stories: Story[];
  props: PageProps;
  onHide: (story: Story, author: boolean) => void;
  empty?: string;
  continueReading?: boolean;
}) {
  const { t } = useI18n();
  return (
    <section className="story-shelf">
      <Title order={2} mb="lg">
        {title}
      </Title>
      {stories.length ? (
        <div className="discovery-grid">
          {stories.map((story) => (
            <StoryCard
              key={story.uid}
              story={story}
              props={props}
              onHide={onHide}
              continueReading={continueReading}
            />
          ))}
        </div>
      ) : (
        <Text c="dimmed">{empty ?? t('discovery.empty')}</Text>
      )}
    </section>
  );
}
