import { Tooltip } from '@mantine/core';
import { UnstyledButton } from '@mantine/core';
import type { ReactionConfiguration } from '../../shared/reader.js';
import { useI18n } from '../../localisation/index.js';
import { compactCount } from '../../shared/engagement.js';
export function Reactions({
  configuration,
  selected = [],
  disabled = false,
  onChange,
  counts = {},
}: {
  configuration: ReactionConfiguration | null;
  selected?: string[];
  disabled?: boolean;
  onChange?: (ids: string[]) => void;
  counts?: Record<string, number>;
}) {
  const { t } = useI18n();
  const titles: Record<string, string> = {
    upvote: 'Upvote',
    funny: 'Funny',
    love: 'Love',
    surprised: 'Surprised',
    angry: 'Angry',
    sad: 'Sad',
  };
  return (
    <div
      className="chapter-reactions"
      style={{
        gridTemplateColumns: `repeat(${Math.max(1, configuration?.reactions.length ?? 1)},minmax(0,1fr))`,
      }}
    >
      {configuration?.reactions.map((reaction) => {
        const title =
          titles[reaction.id] === reaction.title
            ? t(`reader.reaction.${reaction.id}`)
            : reaction.title;
        const count = counts[reaction.id] ?? 0;
        return (
          <UnstyledButton
            className="chapter-reaction"
            key={reaction.id}
            disabled={disabled}
            aria-label={t('engagement.reaction_count', { title, count })}
            aria-pressed={selected.includes(reaction.id)}
            onClick={() =>
              onChange?.(
                selected.includes(reaction.id)
                  ? selected.filter((id) => id !== reaction.id)
                  : [...selected, reaction.id],
              )
            }
          >
            <img src={reaction.image} width={36} height={36} alt="" />
            <Tooltip label={String(count)}>
              <span className="reaction-count">{compactCount(count)}</span>
            </Tooltip>
            {configuration.show_titles && <span className="reaction-title">{title}</span>}
          </UnstyledButton>
        );
      })}
    </div>
  );
}
