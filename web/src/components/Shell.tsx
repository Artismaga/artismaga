import { Notifications } from './Notifications.js';
import { useFeedback } from './Feedback.js';
// localisation-mapped
import { useI18n } from '../localisation/index.js';
import { useState } from 'react';
import {
  AppShell,
  Group,
  Text,
  NavLink,
  Avatar,
  Button,
  Burger,
  Badge,
  Stack,
  Anchor,
  Menu,
  NativeSelect,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBook2,
  IconCompass,
  IconBooks,
  IconPencil,
  IconSettings,
  IconLayoutDashboard,
  IconChevronDown,
  IconArrowUpRight,
  IconLogout,
  IconBrandX,
  IconBrandYoutube,
  IconBrandInstagram,
  IconBrandFacebook,
  IconBrandBluesky,
  IconBrandDiscord,
  IconChartBar,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { PageProps } from '../shared/contracts.js';
import { postJson, errorMessage } from '../client/api.js';
export function Shell({ props, children }: { props: PageProps; children: ReactNode }) {
  const { t, tx, options, date, now } = useI18n();
  const [, failure] = useFeedback('error');

  const [opened, setOpened] = useState(false);
  const admin = props.page === 'admin';
  const name = props.siteName;
  return (
    <AppShell
      header={{ height: 72 }}
      navbar={{ width: 244, breakpoint: 'md', collapsed: { mobile: !opened } }}
      padding={0}
      className="app-shell"
    >
      <AppShell.Header className="app-header">
        <Group
          h="100%"
          px={{ base: 'sm', sm: 'lg' }}
          gap="xs"
          justify="space-between"
          wrap="nowrap"
        >
          <Group gap="sm" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={() => setOpened(!opened)}
              hiddenFrom="md"
              aria-label={t('ui.toggle_navigation_dfc1e6d1')}
              aria-expanded={opened}
              aria-controls="app-navigation"
              size="sm"
            />
            <Anchor href="/" className="wordmark">
              <span className="brand-mark">
                <IconBook2 size={23} stroke={1.8} />
              </span>
              {name}
            </Anchor>
          </Group>
          <Group gap="sm" wrap="nowrap">
            {props.user && <Notifications account={props.user.uid} />}
            {props.user ? (
              <Menu position="bottom-end" shadow="sm" width={220}>
                <Menu.Target>
                  <UnstyledButton
                    className="user-control"
                    aria-label={t('ui.open_account_menu_04b5bfe6')}
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Avatar
                        src={props.user.avatar_url}
                        name={props.user.display_name}
                        color="brand"
                        radius="xl"
                        size={34}
                      />
                      <Text size="sm" fw={600} className="user-name">
                        {props.user.display_name}
                      </Text>
                      <IconChevronDown size={15} />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{t('ui.your_account_dbb5f637')}</Menu.Label>
                  <Menu.Item
                    component="a"
                    href="/account/settings"
                    leftSection={<IconSettings size={17} />}
                  >
                    {t('ui.account_settings_a587aa1f')}
                  </Menu.Item>
                  {props.permissions.includes('administer') && (
                    <Menu.Item
                      component="a"
                      href="/admin"
                      leftSection={<IconLayoutDashboard size={17} />}
                    >
                      {t('ui.site_administration_9438ec47')}
                    </Menu.Item>
                  )}
                  {props.permissions.includes('configure_localisation') &&
                    !props.permissions.includes('administer') && (
                      <Menu.Item component="a" href="/admin/localisation">
                        {t('ui.localisation_f31f4fc8')}
                      </Menu.Item>
                    )}
                  {props.permissions.includes('view_analytics') && (
                    <Menu.Item
                      component="a"
                      href="/analytics"
                      leftSection={<IconChartBar size={17} />}
                    >
                      {tx('Site Analytics')}
                    </Menu.Item>
                  )}
                  {props.permissions.includes('manage_announcements') &&
                    !props.permissions.includes('administer') && (
                      <Menu.Item component="a" href="/admin/announcements">
                        {tx('Announcements')}
                      </Menu.Item>
                    )}
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<IconLogout size={17} />}
                    onClick={() => {
                      void postJson('/api/auth/logout', {})
                        .then(() => window.location.assign('/'))
                        .catch((e: unknown) => failure(errorMessage(e)));
                    }}
                  >
                    {t('ui.sign_out_48f0d3d3')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            ) : (
              <>
                <Button component="a" href="/account/login" variant="subtle">
                  {t('ui.sign_in_bfd402b2')}
                </Button>
                {props.signupMode !== 'disabled' && (
                  <Button component="a" href="/account/register" className="join-button">
                    {t('ui.join_the_story_b1cf586b')}
                  </Button>
                )}
              </>
            )}
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar
        id="app-navigation"
        data-opened={opened || undefined}
        className="app-nav"
        p="md"
      >
        <NativeSelect
          aria-label={t('ui.interface_language_8027f432')}
          value={props.localisation.locale}
          data={options(
            props.localisation.enabled.map((value) => ({
              value,
              label:
                (
                  {
                    en: 'English',
                    ja: '日本語',
                    zh: '简体中文',
                    es: 'Español',
                    fr: 'Français',
                  } as Record<string, string>
                )[value] ?? value,
            })),
          )}
          onChange={(event) => {
            void postJson('/api/localisation/select', {
              locale: event.currentTarget.value,
            })
              .then(() => window.location.reload())
              .catch((e: unknown) => failure(errorMessage(e)));
          }}
          w="100%"
          mb="md"
          size="sm"
        />
        <Stack gap={4}>
          <Text className="nav-label" size="xs">
            {t('ui.your_reading_world_b941bd28')}
          </Text>
          <NavLink
            component="a"
            href="/"
            label={t('ui.discover_d4a33d5b')}
            leftSection={<IconCompass size={20} />}
            active={props.page === 'home'}
          />
          <NavLink
            label={t('ui.my_library_fbc3b89e')}
            leftSection={<IconBooks size={20} />}
            disabled
            rightSection={
              <Badge size="xs" variant="light" color="gray">
                {t('ui.soon_cf0ee354')}
              </Badge>
            }
          />
          <NavLink
            component="a"
            href={props.user ? '/studio' : '/account/login'}
            label={t('ui.studio_0aa91af2')}
            leftSection={<IconPencil size={20} />}
            active={['studio', 'new_work', 'work', 'chapter'].includes(props.page)}
          />
        </Stack>

        <div className="nav-footer">
          <Text size="xs" c="dimmed">
            {t('site.copyright', { year: date(now, 'year'), site: name })}
          </Text>
          <Group gap="xs" mt="sm">
            {(
              [
                ['x', IconBrandX, 'Twitter / X'],
                ['youtube', IconBrandYoutube, 'YouTube'],
                ['instagram', IconBrandInstagram, 'Instagram'],
                ['facebook', IconBrandFacebook, 'Facebook'],
                ['bluesky', IconBrandBluesky, 'Bluesky'],
                ['discord', IconBrandDiscord, 'Discord'],
              ] as const
            ).map(([network, Icon, label]) =>
              props.site?.socials[network] ? (
                <Anchor
                  key={network}
                  href={props.site.socials[network]}
                  aria-label={label}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon size={19} />
                </Anchor>
              ) : null,
            )}
          </Group>
          {props.site?.support_url && (
            <Anchor href={props.site.support_url} size="xs" mt="sm">
              {t('ui.get_in_touch_115e410f')}
              <IconArrowUpRight size={12} />
            </Anchor>
          )}
        </div>
      </AppShell.Navbar>
      <AppShell.Main>
        <main
          id="main"
          className={`page-content ${admin ? 'admin-content' : ''} ${props.page === 'work' ? 'work-content' : props.page === 'story' ? 'story-content' : props.page === 'genre' ? 'genre-content' : ''}`}
        >
          {children}
        </main>
      </AppShell.Main>
    </AppShell>
  );
}
