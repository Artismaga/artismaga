// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { pageTitle } from '../../shared/page-title.js';
import { usePathTab } from '../../client/navigation.js';
import { useState, useEffect } from 'react';
import { Title, Text, Tabs, Group, Badge } from '@mantine/core';
import {
  IconUser,
  IconShieldLock,
  IconBook2,
  IconAdjustments,
  IconBell,
  IconLock,
  IconAccessible,
} from '@tabler/icons-react';
import type { PageProps } from '../../shared/contracts.js';
import type { Preferences } from '../../shared/settings.js';
import { Login } from '../Accounts.js';
import { ProfilePanel } from './ProfilePanel.js';
import { PreferencesPanel } from './PreferencesPanel.js';
import type { PreferenceSection } from './PreferencesPanel.js';
import { SecurityPanel } from './SecurityPanel.js';
const sections = [
  ['profile', 'Profile', IconUser],
  ['account', 'Account', IconShieldLock],
  ['reading', 'Reading', IconBook2],
  ['content', 'Preferences', IconAdjustments],
  ['notifications', 'Notifications', IconBell],
  ['privacy', 'Privacy', IconLock],
  ['accessibility', 'Accessibility', IconAccessible],
] as const;
export function AccountSettings(props: PageProps) {
  const { t, tx } = useI18n();

  const [active, setActive] = usePathTab(
    props.section || 'profile',
    '/account/settings',
    sections.map(([key]) => key),
  );
  const [preferences, setPreferences] = useState<Preferences | null>(
    props.account?.preferences ?? null,
  );
  const [revision, setRevision] = useState(props.account?.preferences_revision ?? 0);
  useEffect(() => {
    document.title = pageTitle(props, active ?? '');
  }, [active, props.siteName]);
  if (!props.account || !preferences) return <Login {...props} />;
  const account = props.account;
  return (
    <>
      <Group justify="space-between" className="page-heading" align="flex-start">
        <div>
          <Text className="eyebrow">{t('ui.your_personal_space_8e6ad7f4')}</Text>
          <Title order={1}>{t('ui.account_settings_a587aa1f')}</Title>
          <Text c="dimmed" mt="sm">
            {t('ui.make_yourself_at_home_keep_things_just_the_way_y_597bc497')}
          </Text>
        </div>
        <Badge variant="light">{account.user.group_key}</Badge>
      </Group>
      <Tabs value={active} onChange={setActive} className="settings-tabs">
        <Tabs.List>
          {sections.map(([key, label, Icon]) => (
            <Tabs.Tab key={key} value={key} leftSection={<Icon size={17} />}>
              {tx(label)}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="profile" pt="lg">
          <ProfilePanel account={account} />
        </Tabs.Panel>
        <Tabs.Panel value="account" pt="lg">
          <SecurityPanel account={account} mailEnabled={props.mailEnabled} />
        </Tabs.Panel>
        {(
          ['reading', 'content', 'notifications', 'privacy', 'accessibility'] as PreferenceSection[]
        ).map((section) => (
          <Tabs.Panel value={section} key={section} pt="lg">
            <PreferencesPanel
              section={section}
              value={preferences}
              revision={revision}
              onSaved={(next, newRevision) => {
                setPreferences(next);
                setRevision(newRevision);
              }}
            />
          </Tabs.Panel>
        ))}
      </Tabs>
    </>
  );
}
