// localisation-mapped
import { useI18n } from '../localisation/index.js';
import { useEffect, useState } from 'react';
import { Card, Text, Title, Anchor, Stack, Badge, Group } from '@mantine/core';
import { IconBook2, IconShieldCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { PageProps } from '../shared/contracts.js';
import { ApiForm, EmailField, Field, PasswordField } from '../components/Form.js';
function AuthLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { t, tx } = useI18n();

  return (
    <div className="auth-layout">
      <div className="auth-intro">
        <span className="soft-icon">
          <IconBook2 size={24} />
        </span>
        <Text className="eyebrow" mt="lg">
          {t('ui.a_place_for_your_next_chapter_85c90367')}
        </Text>
        <Title order={1}>{tx(title)}</Title>
        <Text c="dimmed">{tx(description)}</Text>
        <Group gap="xs" mt="lg">
          <IconShieldCheck size={16} className="brand-icon" />
          <Text size="xs" c="dimmed">
            {t('ui.private_by_default_yours_to_make_your_own_ee609fe2')}
          </Text>
        </Group>
      </div>
      <Card p="xl">{children}</Card>
    </div>
  );
}
export function Login({ signupMode }: PageProps) {
  const { t } = useI18n();

  return (
    <AuthLayout
      title={t('ui.welcome_back_dfdbca16')}
      description={t('ui.your_stories_your_people_your_little_corner_of_t_67f76492')}
    >
      <Stack gap="lg">
        <div>
          <Title order={2}>{t('ui.sign_in_bfd402b2')}</Title>
          <Text size="sm" c="dimmed" mt="xs">
            {t('ui.make_yourself_at_home_0fee4c6e')}
          </Text>
        </div>
        <ApiForm
          api="/api/auth/login"
          label={t('ui.sign_in_bfd402b2')}
          redirect="/account/settings"
        >
          <EmailField />
          <PasswordField />
        </ApiForm>
        <Anchor href="/account/reset" size="sm">
          {t('ui.forgot_your_password_afd25fdf')}
        </Anchor>
        {signupMode !== 'disabled' && (
          <Text size="sm" c="dimmed">
            {t('ui.new_here_38c1c445')}
            <Anchor href="/account/register">{t('ui.create_an_account_86033f75')}</Anchor>
          </Text>
        )}
      </Stack>
    </AuthLayout>
  );
}
export function Register({ signupMode }: PageProps) {
  const { t } = useI18n();

  return (
    <AuthLayout
      title={t('ui.every_reader_belongs_048929f3')}
      description={t('ui.an_independent_home_for_the_stories_you_ll_love__254756ce')}
    >
      <Stack gap="lg">
        <Title order={2}>{t('ui.join_the_story_b1cf586b')}</Title>
        {signupMode === 'disabled' ? (
          <Text c="dimmed">{t('ui.new_account_registration_is_currently_closed_9593fd55')}</Text>
        ) : (
          <>
            <ApiForm
              api="/api/auth/register"
              label={t('ui.create_account_798ca2ce')}
              redirect="/account/login"
            >
              <EmailField />
              <Field
                name="display_name"
                label={t('ui.display_name_2b7f6a84')}
                maxLength={80}
                autoComplete="nickname"
              />
              <PasswordField fresh />
              {signupMode === 'invitation' && (
                <>
                  <Badge variant="light" w="fit-content">
                    {t('ui.by_invitation_803d21c6')}
                  </Badge>
                  <Field
                    name="invitation"
                    label={t('ui.invitation_code_e2260d16')}
                    autoComplete="off"
                  />
                </>
              )}
            </ApiForm>
            <Text size="sm" c="dimmed">
              {t('ui.already_a_member_1bfe9d21')}
              <Anchor href="/account/login">{t('ui.sign_in_bfd402b2')}</Anchor>
            </Text>
          </>
        )}
      </Stack>
    </AuthLayout>
  );
}
export function EmailAction({ page, mailEnabled }: PageProps) {
  const { t } = useI18n();

  const [token, setToken] = useState('');
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (fragment) {
      setToken(fragment);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);
  const purpose = page === 'email' ? 'change_email' : page === 'verify' ? 'verify' : 'reset';
  const verify = purpose === 'verify';
  return (
    <AuthLayout
      title={
        purpose === 'change_email'
          ? t('ui.a_new_address_the_same_you_5eb1cee2')
          : verify
            ? t('ui.one_small_step_148b76ba')
            : t('ui.a_fresh_start_ebddb69d')
      }
      description={
        purpose === 'change_email'
          ? t('ui.confirm_access_to_your_new_inbox_all_devices_are_4fccdda1')
          : verify
            ? t('ui.verify_your_email_to_make_the_most_of_your_accou_b6384bdb')
            : t('ui.set_a_new_unique_passphrase_to_get_back_to_your__a8b253c8')
      }
    >
      <Stack gap="lg">
        <Title order={2}>
          {purpose === 'change_email'
            ? t('ui.confirm_new_email_b6aab777')
            : verify
              ? t('ui.verify_your_email_bb265946')
              : t('ui.reset_your_password_59fa4379')}
        </Title>
        {purpose !== 'change_email' && (
          <>
            {!mailEnabled && (
              <Text size="sm" c="dimmed">
                {t('ui.email_delivery_has_not_been_configured_by_the_si_bcf9ee00')}
              </Text>
            )}
            <ApiForm api={`/api/auth/email/${purpose}/request`} label={t('ui.send_email_e0622cb6')}>
              <EmailField />
            </ApiForm>
          </>
        )}
        <ApiForm
          api={`/api/auth/email/${purpose}/confirm`}
          label={
            purpose === 'reset' ? t('ui.set_new_password_6ee6d9db') : t('ui.confirm_email_6e5cad2c')
          }
          redirect="/account/login"
        >
          <Field
            name="token"
            label={t('ui.email_token_47c3058f')}
            autoComplete="off"
            maxLength={64}
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
          />
          {purpose === 'reset' && <PasswordField fresh />}
        </ApiForm>
        <Anchor href="/account/login" size="sm">
          {t('ui.back_to_sign_in_71fe31cc')}
        </Anchor>
      </Stack>
    </AuthLayout>
  );
}
