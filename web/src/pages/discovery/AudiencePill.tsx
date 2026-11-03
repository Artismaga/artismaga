import { Badge } from '@mantine/core';
import { useI18n } from '../../localisation/index.js';
import type { Story } from '../../shared/discovery.js';
export function audienceLabel(audience: Story['details']['target_audience']): string {
  const { minimum_age: min, maximum_age: max } = audience;
  return min === null
    ? max === null
      ? ''
      : `<${max}`
    : max === null
      ? `${min}+`
      : `${min}–${max}`;
}
export function AudiencePill({ story }: { story: Story }) {
  const { t } = useI18n();
  const label = audienceLabel(story.details.target_audience);
  return (
    <Badge variant="filled" color="gray">
      {label || t('story.all_ages')}
    </Badge>
  );
}
