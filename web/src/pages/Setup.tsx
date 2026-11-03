import { useFeedback } from '../components/Feedback.js';
// localisation-mapped
import { useI18n } from '../localisation/index.js';
import { useEffect, useRef, useState } from 'react';
import {
  Anchor,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
  NativeSelect,
  Stack,
  Stepper,
  Text,
  Title,
  SimpleGrid,
} from '@mantine/core';
import { IconBook2, IconArrowRight, IconCheck } from '@tabler/icons-react';
import { Field, formText } from '../components/Form.js';
import { signupModeSchema } from '../shared/contracts.js';
import type { SetupRequest } from '../shared/contracts.js';
import { postJson, errorMessage } from '../client/api.js';
export function Setup() {
  const { t, options, locale } = useI18n();

  const [active, setActive] = useState(0);
  const [mail, setMail] = useState(false);
  const [origin, setOrigin] = useState('http://localhost:8000');
  const [, setMessage] = useFeedback('error');
  const [, progressNotice] = useFeedback('info');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<[string, string][]>([]);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    setOrigin(window.location.origin);
    if (
      location.protocol !== 'https:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    )
      setMessage(
        'Open this website over HTTPS before entering setup credentials. HTTP setup is available only on localhost.',
      );
  }, []);
  function validate(): boolean {
    const form = ref.current;
    if (!form) return false;
    const data = new FormData(form);
    if (active === 1 && data.get('admin_password') !== data.get('confirm_password')) {
      setMessage('Passwords do not match.');
      return false;
    }
    for (const input of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      `[data-step="${active}"] input, [data-step="${active}"] select`,
    )) {
      if (!input.disabled && !input.reportValidity()) return false;
    }
    if (active === 2 && origin.startsWith('https://') && !mail) {
      setMessage(
        'Public HTTPS sites require email verification and password recovery. Enable email to continue.',
      );
      return false;
    }
    return true;
  }
  function next() {
    if (!validate()) return;
    setMessage('');
    if (active === 2 && ref.current) {
      const data = new FormData(ref.current);
      setReview([
        ['Site', formText(data, 'site_name')],
        ['Address', formText(data, 'public_url')],
        ['Administrator', formText(data, 'admin_email')],
        ['Registration', formText(data, 'signup_mode')],
        ['Email', mail ? 'Configured' : 'Local exploration only'],
      ]);
    }
    setActive((value) => Math.min(3, value + 1));
  }
  async function complete() {
    if (!ref.current) return;
    setBusy(true);
    progressNotice('Creating your site…');
    try {
      const data = new FormData(ref.current);
      const text = (key: string) => formText(data, key);
      const payload: SetupRequest = {
        setup_code: text('setup_code'),
        site_name: text('site_name').trim(),
        public_url: text('public_url').trim(),
        signup_mode: signupModeSchema.parse(text('signup_mode')),
        admin_name: text('admin_name'),
        admin_email: text('admin_email'),
        admin_password: text('admin_password'),
        mail: mail
          ? {
              host: text('mail_host'),
              username: text('mail_username'),
              password: text('mail_password'),
              from: text('mail_from'),
            }
          : null,
      };
      await postJson('/api/setup', payload, AbortSignal.timeout(30000));
      progressNotice('Your site is ready. Opening sign in…');
      ref.current.reset();
      const target = new URL('/account/login', payload.public_url);
      if (target.origin === window.location.origin) {
        for (let i = 0; i < 40; i++) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          try {
            const response = await fetch('/health/ready', {
              signal: AbortSignal.timeout(2000),
              cache: 'no-store',
            });
            const value: unknown = await response.json();
            if (
              response.ok &&
              typeof value === 'object' &&
              value !== null &&
              'status' in value &&
              value.status === 'ready'
            ) {
              window.location.assign(target);
              return;
            }
          } catch {
            /* Listener handover may briefly interrupt requests. */
          }
        }
      }
      window.location.assign(target);
    } catch (error: unknown) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <>
      <NativeSelect
        aria-label={t('ui.interface_language_8027f432')}
        value={locale}
        data={options([
          { value: 'en', label: 'English' },
          { value: 'ja', label: '日本語' },
          { value: 'zh', label: '简体中文' },
          { value: 'es', label: 'Español' },
          { value: 'fr', label: 'Français' },
        ])}
        onChange={(e) => window.location.assign(`/setup?locale=${e.currentTarget.value}`)}
        w={160}
        mb="lg"
      />
      <Anchor href="/" className="wordmark">
        <span className="brand-mark">
          <IconBook2 size={22} />
        </span>
        {t('ui.artismaga_4d23810b')}
      </Anchor>
      <Text className="eyebrow">{t('ui.make_room_for_something_wonderful_7bb786cc')}</Text>
      <Title order={1}>{t('ui.a_home_for_your_stories_693777ee')}</Title>
      <Text c="dimmed" mt="sm">
        {t('ui.a_few_thoughtful_choices_and_your_first_chapter__83c6036b')}
      </Text>
      <Stepper active={active} size="sm" aria-label={t('ui.setup_progress_e9b4495a')}>
        <Stepper.Step label={t('ui.site_fa795581')} />
        <Stepper.Step label={t('ui.administrator_e7d3e769')} />
        <Stepper.Step label={t('ui.email_969ccbd3')} />
        <Stepper.Step label={t('ui.review_aff0766a')} />
      </Stepper>
      <Card p="xl">
        <form
          id="setup-form"
          ref={ref}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (active < 3) next();
            else void complete();
          }}
        >
          <fieldset data-step="0" hidden={active !== 0}>
            <legend>{t('ui.make_this_your_site_3c7218cb')}</legend>
            <Stack gap="lg">
              <Text size="sm" c="dimmed">
                {t('ui.retrieve_your_private_setup_code_with_591a6783')}{' '}
                <Code>{t('ui.docker_compose_exec_app_artismaga_setup_code_21119cb5')}</Code>
                {t('ui.it_protects_this_installation_until_you_re_ready_05aafd61')}
              </Text>
              <Field
                name="setup_code"
                label={t('ui.one_time_setup_code_85ed3f2c')}
                type="password"
                minLength={64}
                maxLength={64}
                autoComplete="off"
              />
              <Field
                name="site_name"
                label={t('ui.site_name_e98af105')}
                defaultValue="Artismaga"
                maxLength={100}
              />
              <Field
                name="public_url"
                label={t('ui.website_address_82b2a6fe')}
                type="url"
                value={origin}
                onChange={(e) => setOrigin(e.currentTarget.value)}
              />
              <NativeSelect
                name="signup_mode"
                label={t('ui.who_can_create_an_account_af76601a')}
                defaultValue="invitation"
                data={options([
                  { value: 'invitation', label: 'People with an invitation' },
                  { value: 'open', label: 'Anyone' },
                  { value: 'disabled', label: 'Registration closed' },
                ])}
              />
            </Stack>
          </fieldset>
          <fieldset data-step="1" hidden={active !== 1}>
            <legend>{t('ui.your_administrator_account_9ea73a9a')}</legend>
            <Stack gap="lg">
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <Field
                  name="admin_name"
                  label={t('ui.display_name_2b7f6a84')}
                  defaultValue="Administrator"
                  maxLength={80}
                  autoComplete="nickname"
                />
                <Field
                  name="admin_email"
                  label={t('ui.email_address_f2488fd4')}
                  type="email"
                  maxLength={254}
                  autoComplete="username"
                />
              </SimpleGrid>
              <Field
                name="admin_password"
                label={t('ui.password_15_128_characters_477edb59')}
                type="password"
                minLength={15}
                maxLength={128}
                autoComplete="new-password"
              />
              <Field
                name="confirm_password"
                label={t('ui.confirm_password_5ac265f3')}
                type="password"
                minLength={15}
                maxLength={128}
                autoComplete="new-password"
              />
            </Stack>
          </fieldset>
          <fieldset data-step="2" hidden={active !== 2}>
            <legend>{t('ui.a_reliable_way_back_in_39dbda96')}</legend>
            <Stack gap="lg">
              <Checkbox
                name="mail_enabled"
                label={t('ui.enable_verification_and_password_recovery_email_5dfb7825')}
                checked={mail}
                onChange={(e) => setMail(e.currentTarget.checked)}
              />
              <Text size="sm" c="dimmed">
                {t('ui.optional_for_local_exploration_public_https_site_aba41ec3')}
              </Text>
              <Field
                name="mail_host"
                label={t('ui.smtp_host_ab328f83')}
                disabled={!mail}
                required={mail}
                autoComplete="off"
              />
              <Field
                name="mail_username"
                label={t('ui.smtp_username_ccbee5c5')}
                disabled={!mail}
                required={mail}
                autoComplete="off"
              />
              <Field
                name="mail_password"
                label={t('ui.smtp_password_74eae55b')}
                type="password"
                disabled={!mail}
                required={mail}
                autoComplete="off"
              />
              <Field
                name="mail_from"
                label={t('ui.sender_email_address_84adeace')}
                type="email"
                disabled={!mail}
                required={mail}
              />
            </Stack>
          </fieldset>
          <fieldset data-step="3" hidden={active !== 3}>
            <legend>{t('ui.ready_for_the_first_chapter_4f3b8dc4')}</legend>
            <Text size="sm" c="dimmed" mb="lg">
              {t('ui.review_your_choices_passwords_and_your_setup_cod_db7db446')}
            </Text>
            <dl id="setup-review">
              {review.map(([label, value]) => (
                <Group key={label} justify="space-between" mb="md">
                  <dt>
                    <Text size="sm" c="dimmed">
                      {label}
                    </Text>
                  </dt>
                  <dd>
                    <Text size="sm" fw={600}>
                      {value}
                    </Text>
                  </dd>
                </Group>
              ))}
            </dl>
          </fieldset>

          <div className="wizard-actions">
            <Button
              type="button"
              variant="subtle"
              onClick={() => setActive((value) => Math.max(0, value - 1))}
              disabled={active === 0 || busy}
            >
              {t('ui.back_76900f1b')}
            </Button>
            {active < 3 ? (
              <Button type="button" onClick={next} rightSection={<IconArrowRight size={16} />}>
                {t('ui.continue_31fbef16')}
              </Button>
            ) : (
              <Button type="submit" loading={busy} rightSection={<IconCheck size={16} />}>
                {t('ui.create_my_site_3533e45e')}
              </Button>
            )}
          </div>
        </form>
      </Card>
    </>
  );
}
