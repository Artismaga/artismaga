import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { ActionIcon, Group, Stack, Tooltip, Text } from '@mantine/core';
import { IconBold, IconItalic, IconEyeOff, IconSend, IconX } from '@tabler/icons-react';
import { useI18n } from '../../localisation/index.js';
import { commentDocument, commentMarkdown } from './document.js';
import { commentExtensions } from './editor.js';
import { GifPicker } from './GifPicker.js';
import { EmojiPicker } from './EmojiPicker.js';
import { CommentBody } from './Body.js';
export function Composer({
  initial = '',
  initialGif = null,
  onSend,
  onCancel,
}: {
  initial?: string;
  initialGif?: string | null;
  onSend: (body: string, gif: string | null) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [body, setBody] = useState(initial),
    [gif, setGif] = useState(initialGif),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const sendAction = useRef(() => {});
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: commentExtensions(() => setError(t('comments.too_long'))),
    content: commentDocument(initial),
    editorProps: {
      attributes: {
        class: 'comment-editor',
        'aria-label': t('comments.write'),
        'aria-multiline': 'true',
        role: 'textbox',
        'data-placeholder': t('comments.write'),
        spellcheck: 'true',
      },
      handleKeyDown: (_view, event) => {
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.isComposing &&
          !editor?.view.composing
        ) {
          event.preventDefault();
          sendAction.current();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        if (text === undefined) return true;
        event.preventDefault();
        if (Array.from(text).length > 4000) {
          setError(t('comments.too_long'));
          return true;
        }
        editor?.commands.insertContent(commentDocument(text).content ?? []);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      setBody(commentMarkdown(current.getJSON()));
      setError('');
    },
  });
  useEffect(() => {
    editor?.setEditable(!busy);
  }, [editor, busy]);
  async function send() {
    if (busy || (!body.trim() && !gif) || !editor) return;
    setBusy(true);
    setError('');
    try {
      await onSend(body, gif);
      editor.commands.clearContent();
      setBody('');
      setGif(null);
    } catch {
      setError(t('comments.failed'));
    } finally {
      setBusy(false);
    }
  }
  sendAction.current = () => void send();
  return (
    <Stack gap="xs" className="comment-composer">
      {editor ? (
        <EditorContent editor={editor} />
      ) : (
        <div className="comment-editor comment-editor-preview">
          <CommentBody text={initial} />
        </div>
      )}
      {gif && (
        <Group>
          <img src={`/api/comments/gifs/${gif}`} alt={t('comments.gif')} className="comment-gif" />
          <Tooltip label={t('comments.remove_gif')}>
            <ActionIcon
              disabled={busy}
              aria-label={t('comments.remove_gif')}
              onClick={() => setGif(null)}
            >
              <IconX />
            </ActionIcon>
          </Tooltip>
        </Group>
      )}
      <Group justify="space-between" wrap="nowrap">
        <Group gap={4} wrap="nowrap">
          {(
            [
              [IconBold, 'bold'],
              [IconItalic, 'italic'],
              [IconEyeOff, 'spoiler'],
            ] as const
          ).map(([Icon, mark]) => (
            <Tooltip key={mark} label={t(`comments.${mark}`)}>
              <ActionIcon
                variant={editor?.isActive(mark) ? 'light' : 'subtle'}
                disabled={busy || !editor}
                aria-label={t(`comments.${mark}`)}
                aria-pressed={editor?.isActive(mark) ?? false}
                onClick={() => editor?.chain().focus().toggleMark(mark).run()}
              >
                <Icon size={18} />
              </ActionIcon>
            </Tooltip>
          ))}
          <EmojiPicker
            disabled={busy || !editor}
            onChoose={(text) => {
              editor
                ?.chain()
                .focus()
                .insertContent({ type: 'commentEmoji', attrs: { text } })
                .run();
            }}
          />
          <GifPicker disabled={busy} onChoose={setGif} />
        </Group>
        <Group gap={4} wrap="nowrap">
          {onCancel && (
            <Tooltip label={t('comments.cancel')}>
              <ActionIcon
                variant="subtle"
                aria-label={t('comments.cancel')}
                disabled={busy}
                onClick={onCancel}
              >
                <IconX />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label={t('comments.send')}>
            <ActionIcon
              aria-label={t('comments.send')}
              loading={busy}
              disabled={(!body.trim() && !gif) || !editor}
              onClick={() => void send()}
            >
              <IconSend size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      {error && (
        <Text role="alert" c="red" size="sm">
          {error}
        </Text>
      )}
    </Stack>
  );
}
