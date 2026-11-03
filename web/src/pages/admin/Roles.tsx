import { useFeedback } from '../../components/Feedback.js';
// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { useState } from 'react';
import {
  Card,
  Text,
  Stack,
  Group,
  TextInput,
  Checkbox,
  Badge,
  Button,
  Alert,
  Accordion,
  NavLink,
} from '@mantine/core';
import { IconShieldLock, IconPlus } from '@tabler/icons-react';
import type { Role } from '../../shared/studio.js';
import { ApiForm, formText } from '../../components/Form.js';
import { postJson, errorMessage } from '../../client/api.js';
const permissions = [
  ['create_story', 'Create and edit works'],
  ['publish_story', 'Publish stories'],
  ['comment', 'Write comments'],
  ['review', 'Leave reviews'],
  ['manage_comments', 'Manage Comments'],
  ['configure_localisation', 'Configure localisation'],
  ['manage_announcements', 'Manage announcements'],
  ['view_analytics', 'View site analytics'],
] as const;
export function Roles({
  roles: initial,
  onChange,
}: {
  roles: Role[];
  onChange: (roles: Role[]) => void;
}) {
  const { t } = useI18n();

  const [roles, setRoles] = useState(initial);
  const updateRoles = (next: Role[]) => {
    setRoles(next);
    onChange(next);
  };
  const [selected, setSelected] = useState<string | null>(initial[0]?.key ?? null);
  const role = roles.find((r) => r.key === selected);
  const create = selected === null;
  return (
    <Stack gap="lg">
      <Alert icon={<IconShieldLock size={18} />}>
        {t('ui.site_administration_stays_with_the_protected_adm_9f43ba02')}
      </Alert>
      <div className="role-layout">
        <Card p="sm" component="nav" aria-label={t('ui.roles_permissions_9d598ceb')}>
          <Stack gap={4}>
            {roles.map((item) => (
              <NavLink
                component="button"
                type="button"
                key={item.key}
                label={item.name}
                active={selected === item.key}
                leftSection={
                  item.key === 'administrator' ? <IconShieldLock size={18} /> : undefined
                }
                onClick={() => setSelected(item.key)}
              />
            ))}
            <NavLink
              component="button"
              type="button"
              label={t('ui.create_role_221163d6')}
              leftSection={<IconPlus size={18} />}
              active={create}
              onClick={() => setSelected(null)}
            />
          </Stack>
        </Card>
        {(create || role) && (
          <RoleEditor
            key={selected ?? 'create-role'}
            role={role ?? { key: '', name: '', permissions: [], revision: 0 }}
            create={create}
            onSaved={(next) => {
              updateRoles(
                create ? [...roles, next] : roles.map((r) => (r.key === next.key ? next : r)),
              );
              setSelected(next.key);
            }}
            onDeleted={() => {
              updateRoles(roles.filter((r) => r.key !== selected));
              setSelected(roles.find((r) => r.key !== selected)?.key ?? null);
            }}
          />
        )}
      </div>
    </Stack>
  );
}
function RoleEditor({
  role,
  create = false,
  onSaved,
  onDeleted,
}: {
  role: Role;
  create?: boolean;
  onSaved: (r: Role) => void;
  onDeleted?: () => void;
}) {
  const { t, tx } = useI18n();

  const [revision, setRevision] = useState(role.revision);
  const [, setError] = useFeedback('error');
  const protectedRole = role.key === 'administrator';
  let submitted: Role = role;
  return (
    <Card>
      {protectedRole && (
        <Badge mb="md" leftSection={<IconShieldLock size={14} />}>
          {t('ui.protected_b0ed2633')}
        </Badge>
      )}
      <fieldset disabled={protectedRole} className="role-fields">
        <ApiForm
          disabled={protectedRole}
          api="/api/admin/roles"
          label={create ? t('ui.create_role_221163d6') : t('ui.save_role_c7523b15')}
          transform={(data) => {
            submitted = {
              key: create ? formText(data, 'key') : role.key,
              name: formText(data, 'name'),
              permissions: permissions.filter(([p]) => data.has(p)).map(([p]) => p),
              revision,
            };
            return { ...submitted, create };
          }}
          onSaved={(result) => {
            if (result.revision !== undefined) {
              setRevision(result.revision);
              onSaved({ ...submitted, revision: result.revision });
            }
          }}
        >
          <Group justify="space-between">
            <Text fw={650}>{create ? t('ui.new_role_500f2f9d') : role.name}</Text>
            {!create && (
              <Badge variant="light" color="gray">
                {role.key}
              </Badge>
            )}
          </Group>
          {create && (
            <TextInput
              name="key"
              label={t('ui.role_key_e2db287a')}
              description={t('ui.3_40_lowercase_letters_digits_or_underscores_sta_52c1b519')}
              required
              minLength={3}
              maxLength={40}
              pattern="[a-z][a-z0-9_]{2,39}"
            />
          )}
          <TextInput
            name="name"
            label={t('ui.role_name_82c784ca')}
            defaultValue={role.name}
            required
            maxLength={60}
          />
          <Text size="sm" fw={600}>
            {t('ui.permissions_abccc78c')}
          </Text>
          <Accordion
            multiple
            keepMounted
            keepMountedMode="display-none"
            defaultValue={protectedRole ? ['works', 'community', 'site'] : ['works']}
          >
            {[
              ['works', 'Works', permissions.slice(0, 2)],
              ['community', 'Community', permissions.slice(2, 5)],
              ['site', 'Site administration', permissions.slice(5)],
            ].map(([id, label, items]) => (
              <Accordion.Item key={String(id)} value={String(id)}>
                <Accordion.Control>{tx(String(label))}</Accordion.Control>
                <Accordion.Panel>
                  <Stack>
                    {(items as (typeof permissions)[number][]).map(([value, label]) => (
                      <Checkbox
                        key={value}
                        name={value}
                        label={value === 'manage_comments' ? t('comments.manager') : tx(label)}
                        defaultChecked={protectedRole || role.permissions.includes(value)}
                      />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </ApiForm>
        {!create && !protectedRole && !['reader', 'author'].includes(role.key) && (
          <Button
            mt="md"
            size="xs"
            variant="subtle"
            color="red"
            onClick={() => {
              void postJson(`/api/admin/roles/${encodeURIComponent(role.key)}/delete`, { revision })
                .then(() => onDeleted?.())
                .catch((e: unknown) => setError(errorMessage(e)));
            }}
          >
            {t('ui.remove_unused_role_6e782437')}
          </Button>
        )}
      </fieldset>
    </Card>
  );
}
