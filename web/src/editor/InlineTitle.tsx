import { Tooltip } from '@mantine/core';
import { useFeedback } from '../components/Feedback.js';
import { useRef, useState } from 'react';
import { TextInput, Title, Text } from '@mantine/core';
import { z } from 'zod';
import { detailsSchema } from '../shared/creative.js';
import { useI18n } from '../localisation/index.js';
export function InlineTitle({
  title,
  work,
  chapter,
  canEdit,
}: {
  title: string;
  work: string;
  chapter: string;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(title),
    [saved, setSaved] = useState(title),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const [, failure] = useFeedback('error');
  const [, success] = useFeedback('success');
  const pending = useRef(false);
  async function save() {
    if (pending.current) return;
    if (!value.trim()) {
      setError(true);
      return;
    }
    if (value === saved) {
      setEditing(false);
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(false);
    try {
      const endpoint = `/api/studio/works/${encodeURIComponent(work)}/details`;
      const response = await fetch(endpoint);
      if (!response.ok) throw Error();
      const details = z
        .object({ details: detailsSchema })
        .passthrough()
        .parse(await response.json()).details;
      const node = details.value.nodes.find((n) => n.uid === chapter && n.delete_after === null);
      if (!node) throw Error();
      const result = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: details.revision,
          command: {
            action: 'save_node',
            uid: chapter,
            kind: 'chapter',
            parent: node.parent,
            title: value.trim(),
            synopsis: node.synopsis,
            cover: node.cover,
            disclosures: node.disclosures,
          },
        }),
      });
      if (!result.ok) throw Error();
      setSaved(value.trim());
      setEditing(false);
      success('editor.saved');
      document.title = value.trim() + ' • ' + document.title.split(' • ').slice(1).join(' • ');
    } catch {
      failure('editor.title.error');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="writing-title">
      {editing ? (
        <TextInput
          autoFocus
          aria-label={t('editor.title.edit')}
          value={value}
          maxLength={200}
          readOnly={busy}
          onChange={(e) => setValue(e.currentTarget.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape' && !busy) {
              setValue(saved);
              setEditing(false);
              setError(false);
            }
          }}
          error={error ? t('editor.title.error') : undefined}
        />
      ) : (
        <Title order={1}>
          <Tooltip label={t('editor.title.edit')}>
            <span>
              <button
                type="button"
                disabled={!canEdit}
                className="writing-title-button"

                onClick={() => setEditing(true)}
              >
                {saved}
              </button>
            </span>
          </Tooltip>
        </Title>
      )}
      {busy && (
        <Text size="xs" role="status">
          {t('editor.saving')}
        </Text>
      )}
    </div>
  );
}
