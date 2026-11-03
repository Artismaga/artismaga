// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import {
  Title,
  Text,
  Group,
  Button,
  Card,
  TextInput,
  NativeSelect,
  NavLink,
  SimpleGrid,
  Image,
  Badge,
  Stack,
  Anchor,
} from '@mantine/core';
import {
  IconSearch,
  IconPlus,
  IconBooks,
  IconFolder,
  IconFileText,
  IconUsers,
  IconArrowRight,
} from '@tabler/icons-react';
import type { PageProps } from '../../shared/contracts.js';
const filters = [
  ['all', 'All works', IconBooks],
  ['owned', 'My works', IconFolder],
  ['drafts', 'Drafts', IconFileText],
  ['shared', 'Shared with me', IconUsers],
] as const;
export function Studio(props: PageProps) {
  const { t, tx, options } = useI18n();

  const data = props.studio?.list;
  if (!data) return null;
  const query = (filter: string, offset = 0) =>
    `/studio?${new URLSearchParams({ search: data.search, filter, sort: data.sort, offset: String(offset) })}`;
  return (
    <>
      <Group justify="space-between" mb="lg">
        <Button
          component="a"
          href={data.can_create ? '/studio/new' : undefined}
          disabled={!data.can_create}
          leftSection={<IconPlus size={18} />}
        >
          {t('ui.create_a_work_04cf56a0')}
        </Button>
      </Group>
      <div className="studio-layout">
        <Card className="studio-filters" h="fit-content">
          <Text className="nav-label">{t('ui.your_workspace_cd2d7f2c')}</Text>
          {filters.map(([key, label, Icon]) => (
            <NavLink
              key={key}
              component="a"
              href={query(key)}
              label={tx(label)}
              active={data.filter === key}
              leftSection={<Icon size={19} />}
            />
          ))}
        </Card>
        <Stack gap="lg" className="grow">
          <form action="/studio" method="get" className="studio-search">
            <input type="hidden" name="filter" value={data.filter} />
            <TextInput
              name="search"
              aria-label={t('ui.search_your_works_f2425757')}
              placeholder={t('ui.search_titles_and_subtitles_e4168ad8')}
              defaultValue={data.search}
              leftSection={<IconSearch size={18} />}
              maxLength={120}
              className="grow"
            />
            <Button type="submit" variant="light">
              {t('ui.search_49c266ba')}
            </Button>
            <NativeSelect
              name="sort"
              aria-label={t('ui.sort_works_6a98fa10')}
              defaultValue={data.sort}
              data={options([
                { value: 'accessed', label: 'Recently accessed' },
                { value: 'edited', label: 'Last edit' },
                { value: 'name', label: 'Name · A–Z' },
                { value: 'created', label: 'Newest first' },
              ])}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </form>
          {!data.can_create && (
            <Card>
              <Text fw={600}>{t('ui.your_reading_account_can_view_shared_works_a83ea75d')}</Text>
              <Text size="sm" c="dimmed" mt="xs">
                {t('ui.creating_or_editing_requires_a_verified_email_an_1907739f')}
              </Text>
            </Card>
          )}
          {data.works.length === 0 ? (
            <Card className="studio-empty">
              <span className="soft-icon">
                <IconBooks size={26} />
              </span>
              <Title order={2} mt="lg">
                {data.search
                  ? t('ui.no_works_match_your_search_5e2e7207')
                  : data.filter === 'shared'
                    ? t('ui.a_space_for_collaboration_50c5b83a')
                    : t('ui.every_world_begins_with_a_first_page_3bc9a1b1')}
              </Title>
              <Text c="dimmed" mt="sm" maw={430}>
                {data.search
                  ? t('ui.try_a_different_title_or_filter_3996e085')
                  : data.filter === 'shared'
                    ? t('ui.works_shared_with_your_account_will_appear_here__a73ea52f')
                    : t('ui.your_books_and_drafts_will_live_here_ready_whene_b2506268')}
              </Text>
              {data.can_create && data.filter !== 'shared' && (
                <Button
                  component="a"
                  href="/studio/new"
                  mt="xl"
                  rightSection={<IconArrowRight size={17} />}
                >
                  {t('ui.create_your_first_work_2a95352b')}
                </Button>
              )}
            </Card>
          ) : (
            <SimpleGrid cols={{ base: 1, xs: 2, lg: 3, xl: 4 }} spacing="lg">
              {data.works.map((work) => {
                const art = props.studio?.artwork[work.uid] ?? props.studio?.default_artwork;
                return (
                  <Card
                    key={work.uid}
                    component="a"
                    href={`/studio/${work.uid}`}
                    className="work-card"
                    p="md"
                  >
                    <Image
                      src={art?.cover_url}
                      alt={`Cover for ${work.title}`}
                      className="work-card-cover"
                      radius="md"
                    />
                    <Group mt="md" justify="space-between">
                      <Badge variant="light" size="xs">
                        {work.status === 'draft'
                          ? t('ui.draft_ebf12ef4')
                          : t(`publishing.status.${work.status}`)}
                      </Badge>
                      {work.owner !== props.user?.uid && (
                        <Badge variant="light" color="gray" size="xs">
                          {t('ui.shared_e3c4b39d')}
                        </Badge>
                      )}
                    </Group>
                    <Text fw={650} mt="sm" lineClamp={2}>
                      {work.title}
                    </Text>
                    {work.subtitle && (
                      <Text size="sm" c="dimmed" mt={4} lineClamp={2}>
                        {work.subtitle}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed" mt="md">
                      {t('ui.edited_7117f080')}
                      {new Date(work.updated_at * 1000).toISOString().slice(0, 10)}
                    </Text>
                  </Card>
                );
              })}
            </SimpleGrid>
          )}
          <Group justify="space-between">
            <Anchor
              href={query(data.filter, Math.max(0, data.offset - 24))}
              size="sm"
              aria-disabled={data.offset === 0}
              className={data.offset === 0 ? 'disabled-link' : ''}
            >
              {t('ui.previous_a57b08a4')}
            </Anchor>
            <Text size="xs" c="dimmed">
              {data.works.length
                ? `${data.offset + 1}–${data.offset + data.works.length}`
                : t('ui.no_works_63c61fa1')}
            </Text>
            <Anchor
              href={query(data.filter, data.offset + 24)}
              size="sm"
              aria-disabled={!data.has_more}
              className={!data.has_more ? 'disabled-link' : ''}
            >
              {t('ui.next_1ff57a29')}
            </Anchor>
          </Group>
        </Stack>
      </div>
    </>
  );
}
