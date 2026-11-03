import { useFeedback } from '../../components/Feedback.js';
import { useState } from 'react';
import { ActionIcon, Menu } from '@mantine/core';
import { IconDotsVertical } from '@tabler/icons-react';
import type { Story } from '../../shared/discovery.js';
import type { PageProps } from '../../shared/contracts.js';
import { useI18n } from '../../localisation/index.js';
import { errorMessage, postJson } from '../../client/api.js';
export function StoryMenu({
  story,
  props,
  blurred,
  onReveal,
  onHide,
  onError,
  allowFeature = false,
}: {
  story: Story;
  props: PageProps;
  blurred: boolean;
  onReveal: () => void;
  onHide: (story: Story, author: boolean) => void;
  onError: (error: string) => void;
  allowFeature?: boolean;
}) {
  const { t } = useI18n();
  const [, success] = useFeedback('success');
  const [busy, setBusy] = useState(false);
  const [featured, setFeatured] = useState(story.featured);
  async function act(action: 'story' | 'author' | 'feature') {
    setBusy(true);
    onError('');
    try {
      if (action === 'feature') {
        await postJson(`/api/studio/stories/${story.uid}/feature`, { featured: !featured });
        setFeatured(!featured);
        success('Saved.');
      } else {
        await postJson(`/api/studio/stories/${story.uid}/hide`, { author: action === 'author' });
        onHide(story, action === 'author');
      }
    } catch (e: unknown) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Menu withinPortal position="bottom-end">
      <Menu.Target>
        <ActionIcon
          className="story-menu"
          variant="default"
          aria-label={t('discovery.actions')}
          disabled={busy}
        >
          <IconDotsVertical size={18} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item disabled>{t('discovery.report')}</Menu.Item>
        {blurred && <Menu.Item onClick={onReveal}>{t('discovery.reveal')}</Menu.Item>}
        <Menu.Item disabled={!props.user} onClick={() => void act('story')}>
          {t('discovery.not_interested')}
        </Menu.Item>
        <Menu.Item disabled={!props.user} onClick={() => void act('author')}>
          {t('discovery.hide_author')}
        </Menu.Item>
        {!props.user && <Menu.Label>{t('discovery.signin_preferences')}</Menu.Label>}
        {allowFeature && props.permissions.includes('administer') && (
          <>
            <Menu.Divider />
            <Menu.Item onClick={() => void act('feature')}>
              {t(featured ? 'story.unfeature' : 'story.feature')}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
