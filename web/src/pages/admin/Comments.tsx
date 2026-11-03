import { Tooltip } from '@mantine/core';
import { Klipy } from './Klipy.js';
import { useState } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Checkbox,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconGripVertical, IconTrash, IconPlus } from '@tabler/icons-react';
import type { ReactionConfiguration } from '../../shared/reader.js';
import { Reactions } from '../reader/Reactions.js';
import { EmojiPicker } from './EmojiPicker.js';
import { postJson, errorMessage } from '../../client/api.js';
import { useFeedback } from '../../components/Feedback.js';
import { useI18n } from '../../localisation/index.js';
export function Comments({ initial }: { initial: ReactionConfiguration | null }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [drag, setDrag] = useState<number | null>(null),
    [selected, setSelected] = useState<string[]>([]);
  const [retired, setRetired] = useState<string[]>([]);
  const [, error] = useFeedback('error'),
    [, success] = useFeedback('success');
  if (!value) return null;
  const configuration = value;
  function move(from: number, to: number) {
    if (busy || uploading || to < 0 || to >= configuration.reactions.length) return;
    const reactions = [...configuration.reactions];
    const [item] = reactions.splice(from, 1);
    if (item) {
      reactions.splice(to, 0, item);
      setValue({ ...configuration, reactions });
    }
  }
  return (
    <Stack>
      <Klipy />
      <Group justify="space-between">
        <Title order={2}>{t('engagement.reactions')}</Title>
        <Checkbox
          label={t('reader.show_titles')}
          checked={configuration.show_titles}
          disabled={busy || uploading}
          onChange={(event) =>
            setValue({ ...configuration, show_titles: event.currentTarget.checked })
          }
        />
      </Group>
      <Text size="sm" c="dimmed">
        {t('engagement.reorder_help')}
      </Text>
      {configuration.reactions.map((reaction, index) => (
        <Group
          key={reaction.id}
          wrap="nowrap"
          gap="xs"
          className="reaction-config-row"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (drag !== null) move(drag, index);
            setDrag(null);
          }}
        >
          <Tooltip label={t('engagement.reorder_help')}>
            <span>
              <ActionIcon
                variant="subtle"
                color="gray"
                draggable
                disabled={busy || uploading}
                aria-label={`${t('reader.drag')} ${reaction.title}`}

                onDragStart={() => setDrag(index)}
                onDragEnd={() => setDrag(null)}
                onKeyDown={(event) => {
                  if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                    event.preventDefault();
                    move(index, index + (event.key === 'ArrowUp' ? -1 : 1));
                  }
                }}
              >
                <IconGripVertical size={20} />
              </ActionIcon>
            </span>
          </Tooltip>
          <EmojiPicker
            image={reaction.image}
            disabled={busy || uploading}
            onBusy={setUploading}
            onError={error}
            onChange={(image) => {
              if (reaction.image.startsWith('/media/') && reaction.image !== image)
                setRetired((old) => [...new Set([...old, reaction.image])]);
              setValue((current) =>
                current
                  ? {
                      ...current,
                      reactions: current.reactions.map((r) =>
                        r.id === reaction.id ? { ...r, image } : r,
                      ),
                    }
                  : current,
              );
            }}
          />
          <TextInput
            className="grow"
            aria-label={t('reader.reaction_title')}
            maxLength={40}
            value={reaction.title}
            disabled={busy || uploading}
            onChange={(event) => {
              const title = event.currentTarget.value;
              setValue({
                ...configuration,
                reactions: configuration.reactions.map((r) =>
                  r.id === reaction.id ? { ...r, title } : r,
                ),
              });
            }}
          />
          <ActionIcon
            color="red"
            variant="subtle"
            disabled={busy || uploading}
            aria-label={`${t('reader.remove')} ${reaction.title}`}
            onClick={() => {
              if (reaction.image.startsWith('/media/'))
                setRetired((old) => [...new Set([...old, reaction.image])]);
              setValue({
                ...configuration,
                reactions: configuration.reactions.filter((r) => r.id !== reaction.id),
              });
            }}
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Group>
      ))}
      {configuration.reactions.length < 6 && (
        <Button
          className="add-reaction"
          variant="outline"
          leftSection={<IconPlus size={18} />}
          disabled={busy || uploading}
          onClick={() =>
            setValue({
              ...configuration,
              reactions: [
                ...configuration.reactions,
                {
                  id: `custom_${crypto.randomUUID().replaceAll('-', '')}`,
                  title: t('engagement.new_reaction'),
                  image: '/assets/reactions/1f44d.png',
                },
              ],
            })
          }
        >
          {t('reader.add')}
        </Button>
      )}
      <Button
        loading={busy}
        disabled={uploading || configuration.reactions.some((r) => !r.title.trim())}
        onClick={() => {
          setBusy(true);
          void postJson('/api/admin/comments', { ...configuration, retired_images: retired })
            .then(() => {
              setValue({ ...configuration, revision: configuration.revision + 1 });
              setRetired([]);
              success(t('reader.config_saved'));
            })
            .catch((cause) => error(errorMessage(cause)))
            .finally(() => setBusy(false));
        }}
      >
        {t('reader.save')}
      </Button>
      <Card withBorder>
        <Title order={3} ta="center">
          {t('reader.preview')}
        </Title>
        <Text size="sm" ta="center">
          {t('reader.preview_help')}
        </Text>
        <Reactions configuration={configuration} selected={selected} onChange={setSelected} />
      </Card>
    </Stack>
  );
}
