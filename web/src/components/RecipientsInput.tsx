import { useFeedback } from './Feedback.js';
// localisation-mapped
import { useI18n } from '../localisation/index.js';
import { useEffect, useState } from 'react';
import { TagsInput } from '@mantine/core';
import { z } from 'zod';
const peopleSchema = z.object({
  people: z.array(z.object({ uid: z.string(), display_name: z.string() })),
});
/** IDs stay internal; people select public names or enter exact emails. */
export function RecipientsInput({
  work,
  value,
  onChange,
  disabled = false,
}: {
  work: string;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<z.infer<typeof peopleSchema>['people']>([]);
  const [, setError] = useFeedback('error');
  const label = (uid: string) => {
    const p = people.find((p) => p.uid === uid);
    return p ? `${p.display_name} (${p.uid.slice(-6)})` : uid;
  };
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (search.trim().length < 2 || search.includes('@')) return;
      void fetch(`/api/studio/works/${work}/people?search=${encodeURIComponent(search)}`, {
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw Error('Account search unavailable');
          return peopleSchema.parse(await r.json()).people;
        })
        .then((next) => {
          setPeople((old) => [
            ...old.filter((p) => value.includes(p.uid)),
            ...next.filter((p) => !old.some((o) => o.uid === p.uid && value.includes(o.uid))),
          ]);
          setError('');
        })
        .catch(() => {
          if (!controller.signal.aborted) setError('Account search unavailable');
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [work, search, value.join('\n')]);
  return (
    <TagsInput
      label={t('ui.accounts_8a7c8b67')}
      description={t('ui.search_names_or_enter_exact_email_addresses_sele_bf02caa9')}
      value={value.map(label)}
      data={people.map((p) => label(p.uid))}
      onChange={(items) =>
        onChange(
          items.flatMap((item) => {
            const match = people.find((p) => label(p.uid) === item);
            return match ? [match.uid] : item.includes('@') ? [item] : [];
          }),
        )
      }
      searchValue={search}
      onSearchChange={setSearch}
      disabled={disabled}
      maxTags={50}
      acceptValueOnBlur={false}
      onPaste={(e) => {
        const text = e.clipboardData.getData('text/plain');
        if (!text.includes('@') && !text.includes(',')) queueMicrotask(() => setSearch(text));
      }}
    />
  );
}
