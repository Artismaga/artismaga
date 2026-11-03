// localisation-mapped
import { useI18n } from '../../localisation/index.js';
import { useState } from 'react';
import {
  Avatar,
  Anchor,
  Badge,
  Card,
  Group,
  Text,
  TextInput,
  Textarea,
  Button,
  SimpleGrid,
  Divider,
  Stack,
  ActionIcon,
} from '@mantine/core';
import { IconPlus, IconTrash, IconExternalLink, IconUser } from '@tabler/icons-react';
import { ApiForm, formText } from '../../components/Form.js';
import type { OwnAccount } from '../../shared/contracts.js';
export function ProfilePanel({ account }: { account: OwnAccount }) {
  const { t } = useI18n();

  const [revision, setRevision] = useState(account.profile_revision);
  const [name, setName] = useState(account.user.display_name);
  const [links, setLinks] = useState(account.profile.links);
  return (
    <div className="settings-columns">
      <Card>
        <div className="card-heading">
          <span className="soft-icon">
            <IconUser size={21} />
          </span>
          <div>
            <Text fw={650}>{t('ui.your_public_identity_83892fd1')}</Text>
            <Text size="sm" c="dimmed">
              {t('ui.introduce_the_person_behind_the_page_9190a4fb')}
            </Text>
          </div>
        </div>
        <ApiForm
          api="/api/account/profile"
          label={t('ui.save_profile_0c8209e7')}
          transform={(data) => ({
            revision,
            display_name: formText(data, 'display_name'),
            profile: {
              pen_name: formText(data, 'pen_name'),
              biography: formText(data, 'biography'),
              website: formText(data, 'website'),
              links: links
                .map((_, i) => ({
                  label: formText(data, `link_label_${i}`),
                  url: formText(data, `link_url_${i}`),
                }))
                .filter((l) => l.label || l.url),
            },
          })}
          onSaved={(result, data) => {
            if (result.revision !== undefined) setRevision(result.revision);
            setName(formText(data, 'display_name'));
          }}
        >
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              name="display_name"
              label={t('ui.display_name_2b7f6a84')}
              description={t('ui.how_you_appear_around_the_site_2deb353a')}
              defaultValue={name}
              required
              maxLength={80}
            />
            <TextInput
              name="pen_name"
              label={t('ui.pen_name_4472f851')}
              description={t('ui.your_optional_author_byline_08db6e2b')}
              defaultValue={account.profile.pen_name}
              maxLength={80}
            />
          </SimpleGrid>
          <Textarea
            name="biography"
            label={t('ui.a_little_about_you_76147c32')}
            description={t('ui.your_reading_tastes_your_writing_your_world_up_t_7316a0c9')}
            defaultValue={account.profile.biography}
            minRows={5}
            maxLength={3000}
          />
          <TextInput
            name="website"
            label={t('ui.website_b5a229ac')}
            type="url"
            placeholder="https://your-website.com"
            defaultValue={account.profile.website}
            maxLength={500}
          />
          <Divider />
          <Group justify="space-between">
            <div>
              <Text fw={600} size="sm">
                {t('ui.links_9024c197')}
              </Text>
              <Text size="xs" c="dimmed">
                {t('ui.add_up_to_five_places_readers_can_find_you_f0908d6d')}
              </Text>
            </div>
            <Button
              type="button"
              variant="subtle"
              size="xs"
              leftSection={<IconPlus size={15} />}
              disabled={links.length >= 5}
              onClick={() => setLinks([...links, { label: '', url: '' }])}
            >
              {t('ui.add_link_dfe9ca4d')}
            </Button>
          </Group>
          {links.map((link, i) => (
            <Group key={i} align="flex-end" wrap="nowrap">
              <TextInput
                name={`link_label_${i}`}
                label={t('ui.label_0e66373f')}
                aria-label={`Link ${i + 1} label`}
                value={link.label}
                onChange={(e) =>
                  setLinks(
                    links.map((item, index) =>
                      index === i ? { ...item, label: e.currentTarget.value } : item,
                    ),
                  )
                }
                maxLength={40}
                required
              />
              <TextInput
                name={`link_url_${i}`}
                label={t('ui.address_56ef8f20')}
                aria-label={`Link ${i + 1} address`}
                value={link.url}
                onChange={(e) =>
                  setLinks(
                    links.map((item, index) =>
                      index === i ? { ...item, url: e.currentTarget.value } : item,
                    ),
                  )
                }
                type="url"
                required
                maxLength={500}
                className="grow"
              />
              <ActionIcon
                type="button"
                variant="subtle"
                color="gray"
                size="lg"
                aria-label={`Remove link ${i + 1}`}
                onClick={() => setLinks(links.filter((_, index) => index !== i))}
              >
                <IconTrash size={17} />
              </ActionIcon>
            </Group>
          ))}
        </ApiForm>
      </Card>
      <Stack>
        <Card className="profile-preview">
          <Badge variant="light" size="sm">
            {t('ui.your_profile_bd3f4c53')}
          </Badge>
          <Avatar
            src={account.user.avatar_url}
            name={name}
            color="brand"
            size={88}
            radius="xl"
            mx="auto"
            my="lg"
          />
          <Text fw={650} size="lg" ta="center">
            {name}
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            {account.profile.pen_name || t('ui.every_reader_has_a_story_b0b77faf')}
          </Text>
          <Divider my="lg" />
          <Text size="sm" c="dimmed">
            {t('ui.your_avatar_comes_from_gravatar_images_are_never_fd6b876d')}
          </Text>
          <Anchor href="https://gravatar.com" target="_blank" rel="noreferrer" size="sm" mt="md">
            {t('ui.manage_on_gravatar_2bc8cf6a')}
            <IconExternalLink size={13} />
          </Anchor>
        </Card>
        <Card>
          <Text fw={600} size="sm">
            {t('ui.you_re_in_control_d62b14df')}
          </Text>
          <Text size="sm" c="dimmed" mt="xs">
            {t('ui.public_profiles_and_social_features_are_still_ta_6c3f9f98')}
          </Text>
        </Card>
      </Stack>
    </div>
  );
}
