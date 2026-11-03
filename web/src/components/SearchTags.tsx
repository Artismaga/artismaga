import { useFeedback } from './Feedback.js';
// localisation-mapped
import { useI18n } from '../localisation/index.js';
import { useEffect, useState } from 'react';
import { TagsInput } from '@mantine/core';
import { z } from 'zod';
import { suggestionSchema } from '../shared/creative.js';
import type { Suggestion } from '../shared/creative.js';
/** Store stable identifiers, display names, reject unknown options unless explicitly allowed. */
export function SearchTags({
  label,
  kind,
  value,
  onChange,
  allowCustom = false,
  maxTags = 30,
  scope = 'known',
  disabled = false,
}: {
  label: string;
  kind: 'genres' | 'tags' | 'authors' | 'stories';
  value: string[];
  onChange: (value: string[]) => void;
  allowCustom?: boolean;
  disabled?: boolean;
  maxTags?: number;
  scope?: 'known' | 'allowed';
}) {
  const { t, tx } = useI18n();

  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Suggestion[]>([]);
  const [, setError] = useFeedback('error');
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void fetch(
        `/api/suggestions?kind=${kind}&search=${encodeURIComponent(search)}&selected=${encodeURIComponent(value.join(','))}&scope=${scope}`,
        {
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok) throw Error('Search unavailable');
          return z.object({ options: z.array(suggestionSchema) }).parse(await response.json())
            .options;
        })
        .then((next) => {
          setOptions((previous) => [
            ...previous.filter((o) => value.includes(o.value)),
            ...next.filter(
              (o) => !previous.some((p) => p.value === o.value && value.includes(p.value)),
            ),
          ]);
          setError('');
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted)
            setError(e instanceof Error ? e.message : 'Search unavailable');
        });
    }, 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [kind, scope, search, value.join('\n')]);
  const display = (id: string) => {
    const option = options.find((o) => o.value === id);
    return option
      ? kind === 'authors' || kind === 'stories'
        ? `${option.label} (${option.value.slice(-6)})`
        : option.label
      : id;
  };
  return (
    <TagsInput
      label={tx(label)}
      description={
        kind === 'authors' || kind === 'stories'
          ? t('ui.search_public_names_only_public_works_and_their__4d2b3fb4')
          : undefined
      }
      value={value.map(display)}
      data={options.map((o) => display(o.value))}
      searchValue={search}
      onSearchChange={setSearch}
      onPaste={(event) => {
        if (!allowCustom) {
          const text = event.clipboardData.getData('text/plain');
          queueMicrotask(() => setSearch(text));
        }
      }}
      onChange={(items) =>
        onChange(
          items.flatMap((item) => {
            const option = options.find((o) => display(o.value) === item);
            return option
              ? [option.value]
              : allowCustom
                ? [item]
                : value.includes(item)
                  ? [item]
                  : [];
          }),
        )
      }
      disabled={disabled}
      acceptValueOnBlur={allowCustom}
      maxTags={maxTags}
      limit={30}
      clearable
      placeholder={t('ui.type_to_search_1e825b4f')}
    />
  );
}
