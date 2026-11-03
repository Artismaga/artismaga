import { useFeedback } from '../../components/Feedback.js';
// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { useState } from 'react';
import {
  Card,
  Text,
  TextInput,
  Group,
  Avatar,
  Badge,
  NativeSelect,
  Button,
  Stack,
} from '@mantine/core';
import { IconSearch, IconMailPlus } from '@tabler/icons-react';
import { z } from 'zod';
import { publicUserSchema } from '../../shared/contracts.js';
import type { PageProps } from '../../shared/contracts.js';
import { ApiForm } from '../../components/Form.js';
import { errorMessage, postJson } from '../../client/api.js';
type User = z.infer<typeof publicUserSchema>;
export function People({ props }: { props: PageProps }) {
  const { t } = useI18n();

  const [users, setUsers] = useState(props.administrator?.users ?? []);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [, setError] = useFeedback('error');
  const [hasMore, setHasMore] = useState(users.length === 20);
  async function load(nextOffset: number) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/admin/users?offset=${nextOffset}&search=${encodeURIComponent(search)}`,
      );
      if (!response.ok) throw new Error('Unable to load accounts.');
      const input: unknown = await response.json();
      const result = z
        .object({ users: z.array(publicUserSchema), has_more: z.boolean(), offset: z.number() })
        .parse(input);
      setUsers(result.users);
      setOffset(result.offset);
      setHasMore(result.has_more);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-columns">
      <Card>
        <Text fw={650} size="lg">
          {t('ui.people_not_just_accounts_593fec41')}
        </Text>
        <Text size="sm" c="dimmed" mt="xs" mb="lg">
          {t('ui.search_display_names_and_manage_permission_group_c687fef3')}
        </Text>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load(0);
          }}
        >
          <Group align="flex-end">
            <TextInput
              label={t('ui.find_an_account_68725f02')}
              placeholder={t('ui.search_display_names_104e0f96')}
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              maxLength={80}
              className="grow"
            />
            <Button type="submit" variant="light" loading={busy}>
              {t('ui.search_49c266ba')}
            </Button>
          </Group>
        </form>

        <Stack mt="lg">
          {users.length === 0 ? (
            <Text c="dimmed" size="sm">
              {t('ui.no_accounts_match_this_name_143f9a7b')}
            </Text>
          ) : (
            users.map((user) => (
              <Person
                key={user.uid}
                user={user}
                own={user.uid === props.user?.uid}
                roles={props.administrator?.roles ?? []}
              />
            ))
          )}
          <Group justify="space-between">
            <Button
              variant="subtle"
              size="sm"
              disabled={offset === 0 || busy}
              onClick={() => {
                void load(Math.max(0, offset - 20));
              }}
            >
              {t('ui.previous_a57b08a4')}
            </Button>
            <Text size="xs" c="dimmed">
              {t('ui.showing_d604310a')}
              {offset + 1}
              {t('ui.text_d4f85d36')}
              {offset + users.length}
            </Text>
            <Button
              variant="subtle"
              size="sm"
              disabled={!hasMore || busy}
              onClick={() => {
                void load(offset + 20);
              }}
            >
              {t('ui.next_1ff57a29')}
            </Button>
          </Group>
        </Stack>
      </Card>
      <Card h="fit-content">
        <IconMailPlus size={26} className="brand-icon" />
        <Text fw={650} mt="md">
          {t('ui.invite_someone_in_1e17c929')}
        </Text>
        <Text size="sm" c="dimmed" mt="sm" mb="lg">
          {t('ui.create_a_private_single_use_invitation_it_expire_3ffd1611')}
        </Text>
        <ApiForm api="/api/admin/invitations" label={t('ui.create_invitation_a6612262')} />
      </Card>
    </div>
  );
}
function Person({
  user,
  own,
  roles,
}: {
  user: User;
  own: boolean;
  roles: { key: string; name: string }[];
}) {
  const { t, options } = useI18n();

  const [group, setGroup] = useState(user.group_key);
  const [saved, setSaved] = useState(false);
  const [, setError] = useFeedback('error');
  return (
    <div className="person-row">
      <Group wrap="nowrap">
        <Avatar src={user.avatar_url} name={user.display_name} radius="xl" size={38} />
        <div>
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {user.display_name}
            </Text>
            {own && (
              <Badge size="xs" variant="light">
                {t('ui.you_08b04193')}
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            {user.email_verified
              ? t('ui.verified_email_1685290a')
              : t('ui.email_not_verified_cadc8ba2')}
          </Text>
        </div>
      </Group>
      <Group gap="xs">
        <NativeSelect
          aria-label={`Permission group for ${user.display_name}`}
          data={options(roles.map((r) => ({ value: r.key, label: r.name })))}
          value={group}
          disabled={own}
          onChange={(e) => {
            setGroup(e.currentTarget.value);
            setSaved(false);
          }}
        />
        <Button
          size="xs"
          variant="light"
          disabled={own}
          onClick={() => {
            void postJson(`/api/admin/users/${encodeURIComponent(user.uid)}/group`, {
              group_key: group,
            })
              .then(() => {
                setSaved(true);
                setError('');
              })
              .catch((e: unknown) => setError(errorMessage(e)));
          }}
        >
          {saved ? t('ui.saved_b5c120b3') : t('ui.save_1509f561')}
        </Button>
      </Group>
    </div>
  );
}
