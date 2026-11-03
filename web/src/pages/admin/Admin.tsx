import { Comments } from './Comments.js';
import { Localisation } from './Localisation.js';
// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { pageTitle } from '../../shared/page-title.js';
import { useState, useEffect } from 'react';
import { usePathTab } from '../../client/navigation.js';
import { Text, Tabs, Card } from '@mantine/core';
import {
  IconChartBar,
  IconSettings,
  IconUsers,
  IconShieldCheck,
  IconPalette,
  IconSpeakerphone,
  IconLanguage,
  IconMessageCircle,
} from '@tabler/icons-react';
import type { PageProps } from '../../shared/contracts.js';
import { Taxonomy } from './Taxonomy.js';
import { Performance } from './Performance.js';
import { Identity } from './Identity.js';
import { Announcements } from './Announcements.js';
import { Configuration } from './Configuration.js';
import { Roles } from './Roles.js';
import { Storage } from './Storage.js';
import { People } from './People.js';
export function Admin(props: PageProps) {
  const { t, tx } = useI18n();

  const [roles, setRoles] = useState(props.administrator?.roles ?? []);
  const [active, setActive] = usePathTab(props.section.split('/')[0] || 'overview', '/admin', [
    'overview',
    'configuration',
    'people',
    'roles',
    'identity',
    'announcements',
    'taxonomy',
    'comments',
    'localisation',
  ]);
  useEffect(() => {
    document.title = pageTitle(props, active === 'identity' ? props.section : (active ?? ''));
  }, [active, props.siteName]);
  if (active === 'announcements' && !props.administrator)
    return <Announcements initial={props.announcements} roles={props.announcement_roles} />;
  if (active === 'localisation' && props.localisation_editor && !props.administrator)
    return <Localisation data={props.localisation_editor} />;
  if (!props.administrator)
    return (
      <Card>
        <Text>{t('ui.administrator_permission_is_required_8e2ee2de')}</Text>
      </Card>
    );
  return (
    <>
      <Tabs
        value={active}
        onChange={(value) => {
          if (value === 'localisation' || value === 'announcements' || value === 'identity') {
            window.location.assign(
              value === 'identity' ? '/admin/identity/site' : `/admin/${value}`,
            );
          } else {
            setActive(value);
          }
        }}
        className="settings-tabs"
      >
        <Tabs.List>
          <Tabs.Tab value="overview" leftSection={<IconChartBar size={17} />}>
            {t('ui.overview_d4b1ea57')}
          </Tabs.Tab>
          <Tabs.Tab value="configuration" leftSection={<IconSettings size={17} />}>
            {t('ui.configuration_b332c349')}
          </Tabs.Tab>
          <Tabs.Tab value="people" leftSection={<IconUsers size={17} />}>
            {t('ui.people_invitations_c991276d')}
          </Tabs.Tab>
          <Tabs.Tab value="roles" leftSection={<IconShieldCheck size={17} />}>
            {t('ui.roles_permissions_9d598ceb')}
          </Tabs.Tab>
          <Tabs.Tab value="localisation" leftSection={<IconLanguage size={17} />}>
            {tx('Localisation')}
          </Tabs.Tab>
          <Tabs.Tab value="comments" leftSection={<IconMessageCircle size={17} />}>
            {t('reader.admin')}
          </Tabs.Tab>
          <Tabs.Tab value="taxonomy" leftSection={<IconSettings size={17} />}>
            {t('ui.genres_tags_ed3dbc9a')}
          </Tabs.Tab>
          <Tabs.Tab value="identity" leftSection={<IconPalette size={17} />}>
            {tx('Identity')}
          </Tabs.Tab>
          <Tabs.Tab value="announcements" leftSection={<IconSpeakerphone size={17} />}>
            {tx('Announcements')}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="lg">
          <Performance initial={props.operational} enabled={active === 'overview'} />
        </Tabs.Panel>
        <Tabs.Panel value="identity" pt="lg">
          <Identity settings={props.administrator.settings} section={props.section} />
        </Tabs.Panel>
        <Tabs.Panel value="announcements" pt="lg">
          <Announcements initial={props.announcements} roles={props.announcement_roles} />
        </Tabs.Panel>
        <Tabs.Panel value="configuration" pt="lg">
          <Configuration
            roles={roles}
            settings={props.administrator.settings}
            mailEnabled={props.administrator.mail_enabled}
          />
          {props.administrator.storage && (
            <div style={{ marginTop: 24 }}>
              <Storage settings={props.administrator.storage} />
            </div>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="people" pt="lg">
          <People props={{ ...props, administrator: { ...props.administrator, roles } }} />
        </Tabs.Panel>
        <Tabs.Panel value="roles" pt="lg">
          <Roles roles={roles} onChange={setRoles} />
        </Tabs.Panel>
        <Tabs.Panel value="localisation" pt="lg">
          {props.localisation_editor ? <Localisation data={props.localisation_editor} /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="comments" pt="lg">
          <Comments initial={props.reactions} />
        </Tabs.Panel>
        <Tabs.Panel value="taxonomy" pt="lg">
          {props.administrator.taxonomy && <Taxonomy settings={props.administrator.taxonomy} />}
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
