import { Card, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import type { PageProps } from '../../shared/contracts.js';
import { useI18n } from '../../localisation/index.js';
import { compactCount } from '../../shared/engagement.js';
export function ReadingAnalytics({ props }: { props: PageProps }) {
  const { t, date } = useI18n();
  const analytics = props.studio?.analytics;
  if (!analytics) return null;
  const totals = analytics.chapters.reduce(
    (a, row) => ({
      views: a.views + row.views,
      completions: a.completions + row.completions,
      ratings: a.ratings + row.ratings,
      sum: a.sum + row.rating_sum,
    }),
    { views: 0, completions: 0, ratings: 0, sum: 0 },
  );
  return (
    <Stack>
      <Title order={2}>{t('engagement.analytics')}</Title>
      <Text size="sm" c="dimmed">
        {t('engagement.analytics_help')}
      </Text>
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        {[
          [t('engagement.views'), compactCount(totals.views)],
          [t('engagement.completions'), compactCount(totals.completions)],
          [
            t('engagement.rating'),
            totals.ratings ? (totals.sum / totals.ratings).toFixed(2) : t('engagement.unrated'),
          ],
          [t('engagement.ratings'), compactCount(totals.ratings)],
        ].map(([label, value]) => (
          <Card withBorder key={label}>
            <Text c="dimmed" size="sm">
              {label}
            </Text>
            <Text size="xl" fw={700}>
              {value}
            </Text>
          </Card>
        ))}
      </SimpleGrid>
      <Table.ScrollContainer minWidth={560}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              {['chapter', 'views', 'completions', 'rating', 'ratings'].map((key) => (
                <Table.Th key={key}>{t(`engagement.${key}`)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {analytics.chapters.map((row) => (
              <Table.Tr key={row.chapter}>
                <Table.Td>
                  {props.studio?.details?.value.nodes.find((n) => n.uid === row.chapter)?.title ??
                    row.chapter}
                </Table.Td>
                <Table.Td>{row.views}</Table.Td>
                <Table.Td>{row.completions}</Table.Td>
                <Table.Td>
                  {row.ratings
                    ? (row.rating_sum / row.ratings).toFixed(2)
                    : t('engagement.unrated')}
                </Table.Td>
                <Table.Td>{row.ratings}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Title order={3}>{t('engagement.daily')}</Title>
      <Table.ScrollContainer minWidth={360}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('engagement.date')}</Table.Th>
              <Table.Th>{t('engagement.views')}</Table.Th>
              <Table.Th>{t('engagement.completions')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {analytics.days.map((day) => (
              <Table.Tr key={day.day}>
                <Table.Td>{date(day.day * 86400, 'date')}</Table.Td>
                <Table.Td>{day.views}</Table.Td>
                <Table.Td>{day.completions}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {analytics.days.length === 0 && <Text c="dimmed">{t('engagement.no_data')}</Text>}
    </Stack>
  );
}
