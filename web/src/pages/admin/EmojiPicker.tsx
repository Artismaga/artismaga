import { EmojiGroups } from '../comments/EmojiPicker.js';
import { useRef, useState } from 'react';
import { ActionIcon, Button, Popover, ScrollArea, Stack, TextInput } from '@mantine/core';
import { IconChevronDown, IconUpload } from '@tabler/icons-react';
import { z } from 'zod';
import { assetSchema } from '../../shared/studio.js';
import { errorMessage } from '../../client/api.js';
import { useI18n } from '../../localisation/index.js';
export function EmojiPicker({
  image,
  onChange,
  onBusy,
  onError,
  disabled,
}: {
  image: string;
  onChange: (image: string) => void;
  onBusy: (busy: boolean) => void;
  onError: (error: string) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false),
    [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function upload(file: File | undefined) {
    if (!file) return;
    onBusy(true);
    try {
      if (file.size > 8 * 1024 * 1024) throw Error(t('engagement.image_size'));
      const response = await fetch('/api/artwork?purpose=reaction', {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!response.ok) throw Error(t('engagement.image_failed'));
      const value = z.object({ asset: assetSchema }).parse(await response.json());
      onChange(value.asset.url);
      setOpened(false);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      onBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <>
      <input
        type="file"
        hidden
        ref={input}
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => void upload(event.currentTarget.files?.[0])}
      />
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        width={340}
        trapFocus
        withArrow
      >
        <Popover.Target>
          <ActionIcon
            variant="subtle"
            size="xl"
            disabled={disabled}
            aria-label={t('engagement.pick_emoji')}
            aria-expanded={opened}
            onClick={() => setOpened((value) => !value)}
          >
            <img src={image} width={28} height={28} alt="" />
            <IconChevronDown size={12} />
          </ActionIcon>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <TextInput
              autoFocus
              aria-label={t('engagement.search_emoji')}
              placeholder={t('engagement.search_emoji')}
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <Button
              variant="subtle"
              leftSection={<IconUpload size={16} />}
              onClick={() => {
                if (image.startsWith('/media/')) setOpened(false);
                else input.current?.click();
              }}
            >
              {t('engagement.custom_image')}
            </Button>
            {image.startsWith('/media/') && (
              <Button variant="subtle" size="xs" onClick={() => input.current?.click()}>
                {t('engagement.replace_image')}
              </Button>
            )}
            <ScrollArea h={280}>
              <EmojiGroups
                query={query}
                onChoose={(code) => {
                  onChange(`/assets/reactions/${code}.png`);
                  setOpened(false);
                }}
              />
            </ScrollArea>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </>
  );
}
