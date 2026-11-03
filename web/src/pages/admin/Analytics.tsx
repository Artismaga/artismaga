// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import {
  Card,
  Group,
  Text,
  Badge,
  Skeleton,
  SimpleGrid,
  Title,
  NativeSelect,
  Button,
  Stack,
  Table,
} from '@mantine/core';
import {
  IconEye,
  IconUsers,
  IconBooks,
  IconHeart,
  IconChartBar,
  IconDownload,
  IconArrowUpRight,
  IconClock,
  IconSearch,
  IconCreditCard,
  IconWorld,
  IconMessageCircle,
  IconRoute,
} from '@tabler/icons-react';
const metrics = [
  ['Story views', 'Unique and repeat reading visits', IconEye],
  ['Unique readers', 'People finding their next chapter', IconUsers],
  ['Stories followed', 'Subscriptions and saved stories', IconHeart],
  ['Reading time', 'Time spent with your stories', IconClock],
] as const;
export function Analytics() {
  const { t, tx, options } = useI18n();

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>{t('ui.a_window_into_your_community_ccf0270b')}</Title>
          <Text c="dimmed" size="sm" mt={4}>
            {t('ui.analytics_will_grow_alongside_publishing_reading_6dbb077f')}
          </Text>
        </div>
        <Group gap="sm">
          <NativeSelect
            aria-label={t('ui.analytics_date_range_e3ea3a07')}
            data={options(['Last 30 days'])}
            disabled
          />
          <Button variant="default" leftSection={<IconDownload size={16} />} disabled>
            {t('ui.export_csv_91f71c14')}
          </Button>
        </Group>
      </Group>
      <div className="preview-notice">
        <IconChartBar size={19} />
        <Text size="sm">
          <strong>{t('ui.analytics_preview_adfd80ea')}</strong>{' '}
          {t('ui.these_are_layout_placeholders_not_collected_acti_4f6cd136')}
        </Text>
      </div>
      <SimpleGrid cols={{ base: 1, xs: 2, xl: 4 }} spacing="lg">
        {metrics.map(([title, description, Icon]) => (
          <Card key={tx(title)} className="metric-card">
            <Group justify="space-between">
              <Text size="sm" c="dimmed" fw={500}>
                {tx(title)}
              </Text>
              <Icon size={19} className="muted-icon" />
            </Group>
            <Skeleton h={30} w={92} mt="lg" mb="md" animate={false} />
            <Text size="xs" c="dimmed">
              {tx(description)}
            </Text>
            <Badge size="xs" variant="light" color="gray" mt="md">
              {t('ui.awaiting_data_5389935a')}
            </Badge>
          </Card>
        ))}
      </SimpleGrid>
      <div className="analytics-grid">
        <Card>
          <Group justify="space-between">
            <div>
              <Text fw={650}>{t('ui.reading_activity_5fed514c')}</Text>
              <Text size="xs" c="dimmed">
                {t('ui.views_unique_readers_and_reading_time_over_time_a6315d95')}
              </Text>
            </div>
            <Badge variant="light" color="gray" size="sm">
              {t('ui.not_connected_0303e182')}
            </Badge>
          </Group>
          <div
            className="chart-placeholder"
            role="img"
            aria-label={t('ui.placeholder_for_the_reading_activity_chart_no_ac_690606dd')}
          >
            <div className="chart-axis">
              <span>{t('ui.text_bda05058')}</span>
              <span>{t('ui.text_bda05058')}</span>
              <span>{t('ui.text_bda05058')}</span>
              <span>{t('ui.text_bda05058')}</span>
            </div>
            <div className="chart-grid">
              <div />
              <div />
              <div />
              <div />
              <div className="chart-empty">
                <span className="soft-icon">
                  <IconChartBar size={25} />
                </span>
                <Text size="sm" fw={600} mt="md">
                  {t('ui.the_story_is_just_beginning_09f0a89d')}
                </Text>
                <Text size="xs" c="dimmed" mt={4}>
                  {t('ui.reading_activity_will_appear_here_c69cb7ab')}
                </Text>
              </div>
            </div>
          </div>
          <div className="chart-legend">
            <span />
            {t('ui.story_views_666ffe9b')}
            <span />
            {t('ui.unique_readers_86b5fbdb')}
          </div>
        </Card>
        <Card>
          <Text fw={650}>{t('ui.reader_retention_8aa1f874')}</Text>
          <Text size="xs" c="dimmed" mt={4}>
            {t('ui.from_the_first_chapter_to_the_final_page_b115fc11')}
          </Text>
          <div className="retention-placeholder">
            {[96, 84, 69, 54, 42].map((width, i) => (
              <Group key={i} wrap="nowrap">
                <Skeleton h={10} w={42} animate={false} />
                <Skeleton h={21} w={`${width}%`} radius="sm" animate={false} />
              </Group>
            ))}
          </div>
          <Text size="xs" c="dimmed">
            {t('ui.chapter_to_chapter_retention_completion_and_aban_28dd4a67')}
          </Text>
        </Card>
      </div>
      <Card>
        <Group justify="space-between" mb="lg">
          <div>
            <Text fw={650}>{t('ui.story_performance_0429dafe')}</Text>
            <Text size="xs" c="dimmed">
              {t('ui.compare_releases_readers_ratings_and_followers_0efdb810')}
            </Text>
          </div>
          <IconBooks size={21} className="muted-icon" />
        </Group>
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                {[
                  t('ui.story_e9e509dc'),
                  t('ui.views_69c40459'),
                  t('ui.followers_a145ab34'),
                  t('ui.rating_9f295304'),
                  t('ui.completion_557fe004'),
                ].map((label) => (
                  <Table.Th key={tx(label)}>{tx(label)}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[0, 1, 2].map((row) => (
                <Table.Tr key={row}>
                  {[0, 1, 2, 3, 4].map((col) => (
                    <Table.Td key={col}>
                      <Skeleton h={12} w={col === 0 ? 160 : 48} animate={false} />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Text size="xs" c="dimmed" mt="md">
          {t('ui.story_level_comparisons_become_available_after_s_d5545cba')}
        </Text>
      </Card>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
        {(
          [
            [
              t('ui.discovery_search_6c8d8a09'),
              t('ui.referral_sources_search_impressions_click_throug_59db4572'),
              IconSearch,
            ],
            [
              t('ui.community_engagement_8d2f2c3a'),
              t('ui.ratings_reviews_comments_reactions_bookmarks_and_43b16ebd'),
              IconMessageCircle,
            ],
            [
              t('ui.audience_insights_39886d32'),
              t('ui.aggregate_device_language_and_regional_breakdown_20cd2f72'),
              IconWorld,
            ],
            [
              t('ui.reading_journeys_24e00e11'),
              t('ui.chapter_retention_completion_abandonment_and_rea_0f5d04b5'),
              IconRoute,
            ],
            [
              t('ui.conversions_revenue_848b42ad'),
              t('ui.follow_and_purchase_conversion_stripe_subscripti_6591ed6f'),
              IconCreditCard,
            ],
            [
              t('ui.release_performance_8ac9f152'),
              t('ui.publication_schedules_update_engagement_and_stor_21289132'),
              IconArrowUpRight,
            ],
          ] as const
        ).map(([title, description, Icon]) => (
          <Card key={String(title)}>
            <Icon size={23} className="brand-icon" />
            <Text fw={600} size="sm" mt="md">
              {String(title)}
            </Text>
            <Text size="xs" c="dimmed" mt="xs">
              {String(description)}
            </Text>
            <Badge color="gray" variant="light" size="xs" mt="md">
              {t('ui.backend_planned_84c91968')}
            </Badge>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
