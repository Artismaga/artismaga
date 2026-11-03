import { useFeedback } from '../../components/Feedback.js';
// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { useEffect, useState } from 'react';
import {
  Card,
  Text,
  TextInput,
  PasswordInput,
  Group,
  Badge,
  Button,
  Stack,
  Divider,
  Modal,
  Alert,
  Skeleton,
} from '@mantine/core';
import {
  IconShieldCheck,
  IconDeviceLaptop,
  IconDownload,
  IconTrash,
  IconKey,
  IconMail,
} from '@tabler/icons-react';
import { z } from 'zod';
import { sessionSchema } from '../../shared/settings.js';
import type { OwnAccount } from '../../shared/contracts.js';
import { ApiForm, formText } from '../../components/Form.js';
import { postJson, errorMessage } from '../../client/api.js';
type Session = z.infer<typeof sessionSchema>;
export function SecurityPanel({
  account,
  mailEnabled,
}: {
  account: OwnAccount;
  mailEnabled: boolean;
}) {
  const { t, date } = useI18n();

  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [, setError] = useFeedback('error');
  const [deleting, setDeleting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    void fetch('/api/account/sessions', { signal: abort.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Unable to load sessions.');
        const input: unknown = await r.json();
        setSessions(z.object({ sessions: z.array(sessionSchema) }).parse(input).sessions);
      })
      .catch((e: unknown) => {
        if (!abort.signal.aborted) setError(errorMessage(e));
      });
    return () => abort.abort();
  }, [refresh]);
  return (
    <div className="settings-columns">
      <Stack>
        <Card>
          <div className="card-heading">
            <span className="soft-icon">
              <IconMail size={21} />
            </span>
            <div>
              <Text fw={650}>{t('ui.email_address_f2488fd4')}</Text>
              <Group gap="sm">
                <Text size="sm" c="dimmed">
                  {account.email}
                </Text>
                <Badge
                  size="xs"
                  variant="light"
                  color={account.user.email_verified ? 'brand' : 'orange'}
                >
                  {account.user.email_verified
                    ? t('ui.verified_4f783840')
                    : t('ui.not_verified_15133907')}
                </Badge>
              </Group>
            </div>
          </div>
          {!account.user.email_verified && (
            <Button component="a" href="/account/verify" variant="light" mb="md">
              {t('ui.verify_current_address_7577884d')}
            </Button>
          )}
          {mailEnabled ? (
            <ApiForm api="/api/account/email" label={t('ui.send_confirmation_3233612b')}>
              <TextInput
                name="email"
                label={t('ui.new_email_address_bb0d06f5')}
                type="email"
                required
                autoComplete="email"
              />
              <PasswordInput
                name="current_password"
                label={t('ui.current_password_72ed2bd7')}
                required
                autoComplete="current-password"
              />
              <Text size="xs" c="dimmed">
                {t('ui.your_address_changes_only_after_confirmation_in__00ef5df2')}
              </Text>
            </ApiForm>
          ) : (
            <Alert color="gray">
              {t('ui.email_changes_need_verification_delivery_contact_ebaf0a0a')}
            </Alert>
          )}
        </Card>
        <Card>
          <div className="card-heading">
            <span className="soft-icon">
              <IconKey size={21} />
            </span>
            <div>
              <Text fw={650}>{t('ui.change_password_3f9c991f')}</Text>
              <Text size="sm" c="dimmed">
                {t('ui.keep_your_account_comfortably_secure_69d7beb8')}
              </Text>
            </div>
          </div>
          <ApiForm
            api="/api/account/password"
            label={t('ui.update_password_fe45b401')}
            transform={(data) => {
              if (formText(data, 'new_password') !== formText(data, 'confirm_password'))
                throw new Error('New passwords do not match.');
              return {
                current_password: formText(data, 'current_password'),
                new_password: formText(data, 'new_password'),
              };
            }}
          >
            <PasswordInput
              name="current_password"
              label={t('ui.current_password_72ed2bd7')}
              autoComplete="current-password"
              required
              maxLength={128}
            />
            <PasswordInput
              name="new_password"
              label={t('ui.new_password_3dd9df44')}
              description={t('ui.use_a_unique_passphrase_of_15_128_characters_6de3c3c3')}
              minLength={15}
              maxLength={128}
              autoComplete="new-password"
              required
            />
            <PasswordInput
              name="confirm_password"
              label={t('ui.confirm_new_password_bf000421')}
              minLength={15}
              maxLength={128}
              autoComplete="new-password"
              required
            />
            <Text size="xs" c="dimmed">
              {t('ui.updating_your_password_signs_out_every_active_se_b45726b6')}
            </Text>
          </ApiForm>
        </Card>
        <Card>
          <div className="card-heading">
            <span className="soft-icon">
              <IconDeviceLaptop size={21} />
            </span>
            <div>
              <Text fw={650}>{t('ui.your_sessions_ae54860b')}</Text>
              <Text size="sm" c="dimmed">
                {t('ui.signed_in_devices_times_use_your_device_s_local__317ed511')}
              </Text>
            </div>
          </div>

          {sessions === null ? (
            <Stack>
              <Skeleton h={48} />
              <Skeleton h={48} />
            </Stack>
          ) : (
            <Stack>
              {sessions.map((session, i) => (
                <Group key={session.sid ?? i} justify="space-between" className="session-row">
                  <div>
                    <Group gap="xs">
                      <Text size="sm" fw={600}>
                        {session.device}
                      </Text>
                      {session.current && (
                        <Badge size="xs" variant="light">
                          {t('ui.this_device_d052579c')}
                        </Badge>
                      )}
                    </Group>
                    <Text size="xs" c="dimmed">
                      {t('session.expires', {
                        date: date(session.expires_at),
                      })}
                    </Text>
                  </div>
                  {session.sid && (
                    <Button
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => {
                        void postJson(
                          `/api/account/sessions/${encodeURIComponent(session.sid ?? '')}/revoke`,
                          {},
                        )
                          .then((result) => {
                            if (result.redirect) window.location.assign(result.redirect);
                            else setRefresh((v) => v + 1);
                          })
                          .catch((e: unknown) => setError(errorMessage(e)));
                      }}
                    >
                      {t('ui.sign_out_48f0d3d3')}
                    </Button>
                  )}
                </Group>
              ))}
              <Divider />
              <ApiForm
                api="/api/auth/sessions/revoke"
                label={t('ui.sign_out_all_devices_643afe46')}
                redirect="/account/login"
              />
            </Stack>
          )}
        </Card>
      </Stack>
      <Stack>
        <Card>
          <IconShieldCheck size={26} className="brand-icon" />
          <Text fw={650} mt="md">
            {t('ui.built_around_your_privacy_5fa2ad91')}
          </Text>
          <Text size="sm" c="dimmed" mt="sm">
            {t('ui.passkeys_two_factor_authentication_and_connected_4cb87c7f')}
          </Text>
        </Card>
        <Card>
          <IconDownload size={24} className="brand-icon" />
          <Text fw={650} mt="md">
            {t('ui.take_your_data_with_you_082d97f4')}
          </Text>
          <Text size="sm" c="dimmed" mt="sm" mb="lg">
            {t('ui.download_your_current_profile_preferences_and_se_4f2bcbaf')}
          </Text>
          <Button
            component="a"
            href="/api/account/export"
            variant="light"
            size="sm"
            leftSection={<IconDownload size={16} />}
          >
            {t('ui.export_account_data_50d6057d')}
          </Button>
        </Card>
        <Card>
          <Text fw={650}>{t('ui.billing_payouts_75519591')}</Text>
          <Text size="sm" c="dimmed" mt="sm">
            {t('ui.purchases_subscriptions_and_author_payouts_will__7d89471d')}
          </Text>
        </Card>
        <Card className="danger-card">
          <IconTrash size={23} />
          <Text fw={650} mt="md">
            {t('ui.delete_account_a2e20a33')}
          </Text>
          <Text size="sm" c="dimmed" mt="sm" mb="lg">
            {t('ui.permanently_remove_your_account_profile_and_save_aeec5e26')}
          </Text>
          <Button variant="light" color="red" size="sm" onClick={() => setDeleting(true)}>
            {t('ui.delete_my_account_21d52947')}
          </Button>
        </Card>
      </Stack>
      <Modal
        opened={deleting}
        onClose={() => setDeleting(false)}
        title={t('ui.permanently_delete_your_account_79594f2e')}
      >
        <Text size="sm" c="dimmed" mb="lg">
          {t('ui.this_removes_your_account_and_stored_preferences_b7e01403')}
        </Text>
        <ApiForm
          api="/api/account/delete"
          label={t('ui.permanently_delete_account_66db4b15')}
          danger
        >
          <PasswordInput
            name="current_password"
            label={t('ui.current_password_72ed2bd7')}
            required
            autoComplete="current-password"
          />
          <TextInput
            name="confirmation"
            label={t('account.delete_confirmation', { confirmation: 'DELETE' })}
            required
            pattern="DELETE"
            autoComplete="off"
          />
        </ApiForm>
      </Modal>
    </div>
  );
}
