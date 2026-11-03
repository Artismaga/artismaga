// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { useState } from 'react';
import {
  Card,
  Text,
  Title,
  NativeSelect,
  TextInput,
  PasswordInput,
  Stack,
  Badge,
  Alert,
  Group,
} from '@mantine/core';
import { IconLock, IconDatabase } from '@tabler/icons-react';
import { ApiForm, formText } from '../../components/Form.js';
import type { StorageSettings } from '../../shared/studio.js';
export function Storage({ settings }: { settings: StorageSettings }) {
  const { t, options } = useI18n();

  const [revision, setRevision] = useState(settings.revision);
  const [location, setLocation] = useState(settings.location);
  const [credentialsSet, setCredentialsSet] = useState(settings.credentials_set);
  const [resetKey, setResetKey] = useState(0);
  return (
    <div className="settings-columns">
      <Card>
        <Group mb="lg">
          <span className="soft-icon">
            <IconDatabase size={22} />
          </span>
          <div>
            <Title order={2}>{t('ui.artwork_storage_7b9de729')}</Title>
            <Text size="sm" c="dimmed">
              {t('ui.private_files_delivered_through_your_site_17248778')}
            </Text>
          </div>
        </Group>
        <ApiForm
          key={resetKey}
          api="/api/admin/storage"
          label={t('ui.save_storage_configuration_6db986eb')}
          transform={(data) => ({
            revision,
            location,
            access_key_id: location.kind === 'local' ? null : formText(data, 'access_key_id'),
            secret_access_key:
              location.kind === 'local' ? null : formText(data, 'secret_access_key'),
          })}
          onSaved={(result) => {
            if (result.revision !== undefined) setRevision(result.revision);
            setCredentialsSet(location.kind !== 'local');
            setResetKey(resetKey + 1);
          }}
        >
          <NativeSelect
            label={t('ui.storage_provider_bcdfb6d7')}
            value={location.kind}
            data={options([
              { value: 'local', label: 'Local Disk' },
              { value: 'r2', label: 'Cloudflare R2' },
              { value: 's3', label: 'AWS S3' },
            ])}
            onChange={(e) =>
              setLocation({ ...location, kind: e.currentTarget.value as 'local' | 'r2' | 's3' })
            }
          />
          {location.kind === 'local' ? (
            <Alert>{t('ui.files_are_saved_in_the_app_s_persistent_data_vol_c3e59c98')}</Alert>
          ) : (
            <>
              <TextInput
                label={t('ui.bucket_c83b6579')}
                value={location.bucket}
                onChange={(e) => setLocation({ ...location, bucket: e.currentTarget.value })}
                required
                maxLength={63}
              />
              {location.kind === 'r2' ? (
                <TextInput
                  label={t('ui.cloudflare_account_id_2b462dc8')}
                  value={location.account_id}
                  onChange={(e) => setLocation({ ...location, account_id: e.currentTarget.value })}
                  required
                  minLength={32}
                  maxLength={32}
                />
              ) : (
                <TextInput
                  label={t('ui.aws_region_295e09c8')}
                  placeholder="ap-southeast-2"
                  value={location.region}
                  onChange={(e) => setLocation({ ...location, region: e.currentTarget.value })}
                  required
                  maxLength={40}
                />
              )}
              <Badge variant="light" w="fit-content">
                {credentialsSet
                  ? t('ui.credentials_configured_1c81633a')
                  : t('ui.credentials_required_for_new_locations_eb6ba76c')}
              </Badge>
              <TextInput
                name="access_key_id"
                label={t('ui.replace_access_key_id_feb276a5')}
                autoComplete="off"
                placeholder={t('ui.leave_blank_to_keep_the_saved_key_f93af325')}
                maxLength={4096}
              />
              <PasswordInput
                name="secret_access_key"
                label={t('ui.replace_secret_access_key_32d1ced5')}
                autoComplete="new-password"
                placeholder={t('ui.leave_blank_to_keep_the_saved_secret_e18f8559')}
                maxLength={4096}
              />
              <Text size="xs" c="dimmed">
                {t('ui.saved_credentials_are_never_sent_back_to_the_bro_a2a17611')}
              </Text>
            </>
          )}
        </ApiForm>
      </Card>
      <Stack>
        <Card>
          <IconLock size={26} className="brand-icon" />
          <Text fw={650} mt="md">
            {t('ui.secrets_stay_write_only_2080f78c')}
          </Text>
          <Text size="sm" c="dimmed" mt="sm">
            {t('ui.credentials_are_encrypted_in_the_database_with_a_f27d2ea7')}
          </Text>
        </Card>
        <Card>
          <Text fw={650}>{t('ui.existing_artwork_stays_put_6b4549bc')}</Text>
          <Text size="sm" c="dimmed" mt="sm">
            {t('ui.changing_providers_affects_future_uploads_existi_cb2061ae')}
          </Text>
          <Text size="xs" c="dimmed" mt="md">
            {t('ui.existing_location_configurations_are_retained_cl_7775a6eb')}
          </Text>
        </Card>
      </Stack>
    </div>
  );
}
