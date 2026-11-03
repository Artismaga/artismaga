import { useEffect, useMemo, useState } from 'react';
import { Card, Stack, Text } from '@mantine/core';
import type { PageProps } from '../../shared/contracts.js';
import type { ReleaseSchedule } from '../../shared/schedule.js';
import { countdown, nextRelease, safeTimezone } from '../../shared/schedule.js';
import { formatDate } from '../../localisation/dates.js';
import { useI18n } from '../../localisation/index.js';
export function ReleaseSchedulePanel({
  schedule,
  props,
}: {
  schedule: ReleaseSchedule;
  props: PageProps;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(props.localisation.now);
  const [zone, setZone] = useState(safeTimezone(props.localisation.timezone));
  useEffect(() => {
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setNow(Math.floor(Date.now() / 1000));
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const minute = Math.floor(now / 60);
  const next = useMemo(() => nextRelease(schedule, minute * 60), [schedule, minute]);
  return (
    <Card>
      <Stack gap="xs">
        <Text fw={600} c="dimmed">
          {t('publishing.schedule')}
        </Text>
        <Text>{t(`schedule.${schedule.frequency}`)}</Text>
        {next !== null && (
          <>
            <Text>
              {t('schedule.next', {
                date: formatDate(props.localisation.locale, zone, next, 'datetime'),
                zone,
              })}
            </Text>
            <Text fw={600}>{t('schedule.countdown', { remaining: countdown(next - now) })}</Text>
          </>
        )}
      </Stack>
    </Card>
  );
}
