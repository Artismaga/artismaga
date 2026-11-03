import { useMemo, useState } from 'react';
import { ActionIcon, Popover, ScrollArea, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconMoodSmile, IconSearch } from '@tabler/icons-react';
import emoji from '../../shared/twemoji.json' with { type: 'json' };
import { useI18n } from '../../localisation/index.js';
export const emojiCategories = [
  ['Smileys & Emotion', 'smileys'],
  ['People & Body', 'people'],
  ['Component', 'components'],
  ['Animals & Nature', 'nature'],
  ['Food & Drink', 'food'],
  ['Travel & Places', 'travel'],
  ['Activities', 'activities'],
  ['Objects', 'objects'],
  ['Symbols', 'symbols'],
  ['Flags', 'flags'],
] as const;
export function EmojiPicker({
  onChoose,
  disabled,
}: {
  onChoose: (text: string) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false),
    [query, setQuery] = useState('');
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width="min(340px, calc(100vw - 32px))"
    >
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          disabled={disabled}
          aria-label={t('comments.emoji')}
          onClick={() => setOpened((v) => !v)}
        >
          <IconMoodSmile />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput
            aria-label={t('engagement.search_emoji')}
            placeholder={t('engagement.search_emoji')}
            leftSection={<IconSearch size={17} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          <ScrollArea h="min(360px, 50dvh)" offsetScrollbars>
            {opened && (
              <EmojiGroups
                query={query}
                onChoose={(code) =>
                  onChoose(String.fromCodePoint(...code.split('-').map((v) => parseInt(v, 16))))
                }
              />
            )}
          </ScrollArea>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

export function EmojiGroups({
  query,
  onChoose,
}: {
  query: string;
  onChoose: (code: string) => void;
}) {
  const { t } = useI18n();
  const groups = useMemo(
    () =>
      emojiCategories
        .map(([category, key]) => ({
          key,
          items: emoji.filter(
            (item) =>
              item.category === category &&
              `${item.name} ${item.code}`.toLowerCase().includes(query.trim().toLowerCase()),
          ),
        }))
        .filter((g) => g.items.length),
    [query],
  );
  return (
    <>
      {groups.map((group) => (
        <section key={group.key} aria-label={t(`comments.emoji_category.${group.key}`)}>
          <Text size="xs" fw={600} my="xs">
            {t(`comments.emoji_category.${group.key}`)}
          </Text>
          <div className="emoji-grid">
            {group.items.map((item) => (
              <Tooltip key={item.code} label={item.name}>
                <ActionIcon
                  variant="subtle"
                  aria-label={item.name}
                  onClick={() => onChoose(item.code)}
                >
                  <img
                    loading="lazy"
                    src={`/assets/reactions/${item.code}.png`}
                    alt=""
                    width={24}
                    height={24}
                  />
                </ActionIcon>
              </Tooltip>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
