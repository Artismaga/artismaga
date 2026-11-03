import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Loader,
  Popover,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { IconGif, IconSearch } from '@tabler/icons-react';
import { z } from 'zod';
import { useI18n } from '../../localisation/index.js';
const resultsSchema = z
  .object({
    results: z.array(z.object({ uid: z.string().regex(/^gif_[a-f0-9]{64}$/) }).strict()).max(12),
  })
  .strict();
export function GifPicker({
  onChoose,
  disabled,
}: {
  onChoose: (id: string) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false),
    [query, setQuery] = useState(''),
    [results, setResults] = useState<{ uid: string }[]>([]),
    [searching, setSearching] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    let active = true;
    setSearching(true);
    setFailed(false);
    setResults([]);
    const timer = window.setTimeout(() => {
      void fetch('/api/comments/gifs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw Error();
          return resultsSchema.parse(await response.json());
        })
        .then((data) => {
          if (active) setResults(data.results);
        })
        .catch(() => {
          if (active) setFailed(true);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [opened, query]);
  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width="min(380px, calc(100vw - 32px))"
    >
      <Popover.Target>
        <ActionIcon
          variant="subtle"
          aria-label={t('comments.gif')}
          disabled={disabled}
          onClick={() => setOpened((v) => !v)}
        >
          <IconGif />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput
            autoFocus
            aria-label={t('comments.search_gif')}
            placeholder={t('comments.search_gif')}
            leftSection={<IconSearch size={17} />}
            rightSection={searching ? <Loader size={16} /> : null}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            maxLength={100}
          />
          <Text size="xs" c="dimmed">
            {t(query.trim() ? 'comments.powered_klipy' : 'comments.trending_gifs')}
          </Text>
          <ScrollArea h="min(360px, 50dvh)" offsetScrollbars>
            {failed ? (
              <Text role="alert" size="sm" c="red">
                {t('comments.gif_failed')}
              </Text>
            ) : !searching && !results.length ? (
              <Text size="sm" c="dimmed">
                {t('comments.no_gifs')}
              </Text>
            ) : null}
            <div className="comment-gif-grid" aria-busy={searching}>
              {results.map((item) => (
                <UnstyledButton
                  key={item.uid}
                  className="comment-gif-option"
                  aria-label={t('comments.choose_gif')}
                  onClick={() => {
                    onChoose(item.uid);
                    setOpened(false);
                  }}
                >
                  <img src={`/api/comments/gifs/${item.uid}`} alt="" loading="lazy" />
                </UnstyledButton>
              ))}
            </div>
          </ScrollArea>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
