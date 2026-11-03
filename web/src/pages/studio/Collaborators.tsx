import { useFeedback } from '../../components/Feedback.js';
// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { useEffect, useState } from 'react';
import { TagsInput, NativeSelect, Text, Stack, Group, Button } from '@mantine/core';
import { z } from 'zod';
import { postJson, errorMessage } from '../../client/api.js';
const person = z.object({ uid: z.string(), display_name: z.string() }).strict();
export function Collaborators({
  uid,
  shares,
  onChanged,
}: {
  uid: string;
  shares: { uid: string; display_name: string; can_edit: boolean }[];
  onChanged: () => void;
}) {
  const { t, options } = useI18n();

  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<z.infer<typeof person>[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [access, setAccess] = useState('view');
  const [busy, setBusy] = useState(false);
  const [, setError] = useFeedback('error');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (search.trim().length < 2 || search.includes('@')) return;
      void fetch(`/api/studio/works/${uid}/people?search=${encodeURIComponent(search)}`, {
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw Error('Account search unavailable');
          return z.object({ people: z.array(person) }).parse(await r.json()).people;
        })
        .then((next) => {
          setError('');
          setPeople((old) => [
            ...old.filter((p) => selected.includes(`${p.display_name} (${p.uid.slice(-6)})`)),
            ...next.filter(
              (p) =>
                !old.some(
                  (o) =>
                    o.uid === p.uid && selected.includes(`${o.display_name} (${o.uid.slice(-6)})`),
                ),
            ),
          ]);
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(errorMessage(e));
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, uid, selected.join('\n')]);
  async function save(recipients: string[], remove: boolean) {
    setBusy(true);
    setError('');
    try {
      await postJson(`/api/studio/works/${uid}/shares`, {
        recipients,
        can_edit: access === 'edit',
        remove,
      });
      onChanged();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t('ui.search_by_display_name_or_enter_exact_email_addr_0dacd65b')}
      </Text>
      <TagsInput
        label={t('ui.collaborators_439c0bdd')}
        placeholder={t('ui.search_a_name_or_enter_an_email_55a268f2')}
        data={options(people.map((p) => `${p.display_name} (${p.uid.slice(-6)})`))}
        value={selected}
        onChange={(items) =>
          setSelected(
            items.filter(
              (item) =>
                item.includes('@') ||
                people.some((p) => `${p.display_name} (${p.uid.slice(-6)})` === item),
            ),
          )
        }
        onPaste={(event) => {
          const text = event.clipboardData.getData('text/plain');
          if (!text.includes('@') && !text.includes(',')) queueMicrotask(() => setSearch(text));
        }}
        searchValue={search}
        onSearchChange={setSearch}
        maxTags={50}
        disabled={busy}
        acceptValueOnBlur={false}
      />
      <NativeSelect
        label={t('ui.access_ec5ba0ab')}
        value={access}
        onChange={(e) => setAccess(e.currentTarget.value)}
        data={options([
          { value: 'view', label: 'Can view' },
          { value: 'edit', label: 'Can edit' },
        ])}
      />
      <Button
        disabled={busy || selected.length === 0}
        onClick={() =>
          void save(
            selected.map(
              (s) => people.find((p) => `${p.display_name} (${p.uid.slice(-6)})` === s)?.uid ?? s,
            ),
            false,
          )
        }
      >
        {t('ui.apply_access_to_selected_accounts_f1f0395a')}
      </Button>

      {shares.map((share) => (
        <Group key={share.uid} justify="space-between">
          <div>
            <Text>{share.display_name || t('ui.account_unavailable_72830405')}</Text>
            <Text size="xs" c="dimmed">
              {share.can_edit ? t('ui.can_edit_5abe9e1f') : t('ui.can_view_151dc282')}
            </Text>
          </div>
          <Button
            color="red"
            variant="subtle"
            disabled={busy}
            onClick={() => void save([share.uid], true)}
          >
            {t('ui.remove_access_bb349bfe')}
          </Button>
        </Group>
      ))}
    </Stack>
  );
}
