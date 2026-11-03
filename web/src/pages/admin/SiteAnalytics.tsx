import { Tabs, Title, Text, Stack, Card, Skeleton, Badge } from '@mantine/core';
import { useEffect } from 'react';
import { usePathTab } from '../../client/navigation.js';
import { pageTitle } from '../../shared/page-title.js';
import type { PageProps } from '../../shared/contracts.js';
import { Performance } from './Performance.js';
import { Analytics } from './Analytics.js';
import { useI18n } from '../../localisation/index.js';
const tabs = [
  ['performance', 'Software performance'],
  ['traffic', 'Traffic'],
  ['accounts', 'Registrations & logins'],
  ['stories', 'Story traffic'],
  ['genres', 'Genres & subgenres'],
  ['tags', 'Tags'],
  ['monetisation', 'Monetisation'],
  ['retention', 'Reader retention'],
  ['discovery', 'Discovery & referrals'],
  ['community', 'Community engagement'],
] as const;
export function SiteAnalytics(props: PageProps) {
  const { tx } = useI18n();
  const [active, setActive] = usePathTab(
    props.section || 'performance',
    '/analytics',
    tabs.map((t) => t[0]),
  );
  useEffect(() => {
    document.title = pageTitle(props, active ?? '');
  }, [active, props]);
  return (
    <Stack>
      <Tabs value={active} onChange={setActive} keepMounted={false}>
        <Tabs.List>
          {tabs.map(([key, label]) => (
            <Tabs.Tab value={key} key={key}>
              {tx(label)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="performance" pt="lg">
          <Performance initial={props.operational} view="performance" />
        </Tabs.Panel>
        <Tabs.Panel value="traffic" pt="lg">
          <Performance initial={props.operational} view="traffic" />
        </Tabs.Panel>
        <Tabs.Panel value="accounts" pt="lg">
          <Performance initial={props.operational} view="accounts" />
          <Text size="sm" c="dimmed" mt="md">
            {tx(
              'Historical account trends and date-range reporting will be added with persistent analytics.',
            )}
          </Text>
        </Tabs.Panel>
        <Tabs.Panel value="stories" pt="lg">
          <Analytics />
        </Tabs.Panel>
        {tabs.slice(4).map(([key, label]) => (
          <Tabs.Panel key={key} value={key} pt="lg">
            <Card>
              <Title order={2}>{tx(label)}</Title>
              <Badge mt="sm" color="gray" variant="light">
                {tx('Backend planned')}
              </Badge>
              <Text c="dimmed" my="md">
                {tx(
                  'This section will gain real reporting as the relevant platform features are implemented.',
                )}
              </Text>
              <Skeleton h={220} animate={false} />
            </Card>
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  );
}
