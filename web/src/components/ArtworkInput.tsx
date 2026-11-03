import { useFeedback } from './Feedback.js';
// localisation-mapped
import { useI18n } from '../localisation/index.js';
import { z } from 'zod';
import { useRef, useState } from 'react';
import { Button, FileButton, Group, Image, Text, Stack, Loader } from '@mantine/core';
import { IconPhotoPlus, IconX } from '@tabler/icons-react';
import { assetSchema } from '../shared/studio.js';
import type { AssetRef } from '../shared/studio.js';
import { errorMessage } from '../client/api.js';
export function ArtworkInput({
  label,
  purpose,
  value,
  onChange,
  fallback,
  onBusyChange,
}: {
  label: string;
  purpose:
    | 'cover'
    | 'hero'
    | 'default_cover'
    | 'chapter_cover'
    | 'genre_image'
    | 'genre_hero'
    | 'announcement'
    | 'reaction';
  value: AssetRef | null;
  onChange: (asset: AssetRef | null) => void;
  fallback?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { t, tx } = useI18n();

  const reset = useRef<() => void>(() => {});
  const [busy, setBusy] = useState(false);
  const [, setError] = useFeedback('error');
  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MiB.');
      const response = await fetch(`/api/artwork?purpose=${purpose}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          'Upload failed. Check your writing access, image size and storage configuration.',
        );
      const asset = z.object({ asset: assetSchema }).parse(body).asset;
      onChange(asset);
    } catch (error: unknown) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      reset.current();
    }
  }
  return (
    <Stack gap="sm">
      <Text fw={600} size="sm">
        {tx(label)}
      </Text>
      <div className={`artwork-picker ${purpose === 'hero' ? 'artwork-picker--hero' : ''}`}>
        {value?.url || fallback ? (
          <Image
            src={value?.url ?? fallback}
            alt={`${tx(label)} preview`}
            fit="cover"
            h={purpose === 'hero' ? 140 : 190}
            w={purpose === 'hero' ? '100%' : 128}
            radius="md"
          />
        ) : (
          <div className="artwork-picker-empty">
            <IconPhotoPlus size={28} />
            <Text size="xs">{t('ui.optional_artwork_73b4d872')}</Text>
          </div>
        )}
        <Stack gap="xs" className="grow">
          <Text size="xs" c="dimmed">
            {t('ui.jpeg_png_or_webp_up_to_8_mib_images_are_processe_a1d5c8c2')}
          </Text>
          <Group gap="xs">
            <FileButton
              resetRef={reset}
              onChange={(file) => {
                void upload(file);
              }}
              accept="image/jpeg,image/png,image/webp"
            >
              {(buttonProps) => (
                <Button
                  {...buttonProps}
                  variant="light"
                  size="sm"
                  disabled={busy}
                  leftSection={busy ? <Loader size={14} /> : <IconPhotoPlus size={16} />}
                >
                  {value ? t('ui.replace_image_fcedcb5e') : t('ui.choose_image_f7e6f67f')}
                </Button>
              )}
            </FileButton>
            {value && (
              <Button
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => onChange(null)}
                leftSection={<IconX size={14} />}
              >
                {t('ui.remove_c3812fc4')}
              </Button>
            )}
          </Group>
        </Stack>
      </div>
    </Stack>
  );
}
