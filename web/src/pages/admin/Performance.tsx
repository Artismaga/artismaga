import { useFeedback } from '../../components/Feedback.js';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  Card,
  Group,
  Text,
  Title,
  Stack,
  SimpleGrid,
  Badge,
  Skeleton,
  Progress,
} from '@mantine/core';
import { useI18n } from '../../localisation/index.js';
const snapshotSchema = z.object({
  metrics: z.object({
    uptime_seconds: z.number(),
    requests: z.number(),
    errors: z.number(),
    requests_last_minute: z.number(),
    mean_response_ms: z.number().nullable(),
    logins: z.number(),
    registrations: z.number(),
    cpu_percent: z.number().nullable(),
    memory_bytes: z.number().nullable(),
    gpu_percent: z.number().nullable(),
    series: z.array(z.object({ at: z.number(), requests: z.number() })),
    sampled_at: z.number(),
  }),
  database_available: z.boolean(),
  translator: z.string(),
});
export function Performance({
  initial = null,
  enabled = true,
  view = 'all',
}: {
  initial?: unknown;
  enabled?: boolean;
  view?: 'all' | 'performance' | 'traffic' | 'accounts';
}) {
  const { tx, t, locale, date } = useI18n();
  const [data, setData] = useState(() => snapshotSchema.safeParse(initial).data ?? null);
  const [error, setError] = useState(false);
  const [, failure] = useFeedback('error');
  const interrupted = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch('/api/analytics/live', {
          signal: AbortSignal.timeout(5000),
          cache: 'no-store',
        });
        if (!r.ok) throw Error();
        const next = snapshotSchema.parse(await r.json());
        if (!stopped) {
          setData(next);
          setError(false);
          interrupted.current = false;
        }
      } catch {
        if (!stopped) {
          setError(true);
          if (!interrupted.current)
            failure('The latest sample is unavailable. Previous values are retained.');
          interrupted.current = true;
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [enabled]);
  const m = data?.metrics;
  const unavailable = tx('Unavailable');
  const metrics = [
    ['Requests in the last minute', m?.requests_last_minute?.toLocaleString(locale)],
    ['CPU usage', m?.cpu_percent === null ? unavailable : m?.cpu_percent?.toFixed(1) + '%'],
    [
      'Memory in use',
      m?.memory_bytes === null
        ? unavailable
        : m?.memory_bytes
          ? `${Math.round(m.memory_bytes / 1048576)} MiB`
          : undefined,
    ],
    ['GPU utilisation', m?.gpu_percent === null ? unavailable : m?.gpu_percent + '%'],
    [
      'Mean response time',
      m?.mean_response_ms === null ? unavailable : m?.mean_response_ms?.toFixed(1) + ' ms',
    ],
    ['Server errors', m?.errors?.toLocaleString(locale)],
    ['Successful logins', m?.logins?.toLocaleString(locale)],
    ['Registrations', m?.registrations?.toLocaleString(locale)],
    ['Requests', m?.requests?.toLocaleString(locale)],
  ];
  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>
            {tx(
              view === 'all'
                ? 'Service health'
                : view === 'performance'
                  ? 'Software performance'
                  : view === 'traffic'
                    ? 'Traffic'
                    : 'Registrations & logins',
            )}
          </Title>
          <Text c="dimmed" size="sm">
            {tx(
              'Live app process measurements refresh every three seconds. Counters reset when the app restarts.',
            )}
          </Text>
        </div>
        <Badge color={error ? 'red' : 'green'}>
          {tx(error ? 'Connection interrupted' : 'Live')}
        </Badge>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }}>
        {metrics
          .filter((_, index) =>
            view === 'all'
              ? index < 8
              : view === 'performance'
                ? [1, 2, 3, 4, 5].includes(index)
                : view === 'traffic'
                  ? [0, 4, 5, 8].includes(index)
                  : [6, 7].includes(index),
          )
          .map(([label, value]) => (
            <Card key={label}>
              <Text size="sm" c="dimmed">
                {tx(label)}
              </Text>
              {m ? (
                <Title order={3} mt="sm">
                  {value ?? unavailable}
                </Title>
              ) : (
                <Skeleton h={30} mt="sm" />
              )}
            </Card>
          ))}
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Card>
          <Title order={3}>{tx('Services')}</Title>
          <Group mt="md" justify="space-between">
            <Text>{tx('Database')}</Text>
            <Badge color={data?.database_available ? 'green' : 'red'}>
              {tx(data?.database_available ? 'Connected' : 'Unavailable')}
            </Badge>
          </Group>
          <Group mt="sm" justify="space-between">
            <Text>{tx('Local translator')}</Text>
            <Badge variant="light">
              {data &&
              [
                'ready',
                'downloading',
                'loading',
                'not_loaded',
                'download_failed',
                'load_failed',
              ].includes(data.translator)
                ? t(`status.${data.translator}`)
                : tx(data?.translator ?? 'Unavailable')}
            </Badge>
          </Group>
          <Text size="sm" c="dimmed" mt="md">
            {tx('Uptime')}: {m ? Math.floor(m.uptime_seconds / 60) : '—'} {t('common.minutes')}
          </Text>
        </Card>
        <Card>
          <Title order={3}>{tx('Recent request activity')}</Title>
          <Text size="xs" c="dimmed" mb="md">
            {tx(
              'Aggregated requests; health probes, assets and live telemetry polling are excluded.',
            )}
          </Text>
          <Stack gap={5}>
            {m?.series.slice(-10).map((s) => (
              <Group key={s.at} wrap="nowrap">
                <Text size="xs" w={70}>
                  {date(s.at, 'time')}
                </Text>
                <Progress
                  flex={1}
                  value={Math.min(100, s.requests * 10)}
                  aria-label={tx('Requests')}
                />
                <Text size="xs">{s.requests}</Text>
              </Group>
            ))}
          </Stack>
          {!m?.series.length && <Text c="dimmed">{tx('Waiting for traffic.')}</Text>}
        </Card>
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {tx(
          'CPU and memory include managed renderer and translator processes. GPU usage requires a supported device sensor; unavailable sensors are never reported as zero.',
        )}
      </Text>
    </Stack>
  );
}
