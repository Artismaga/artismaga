import { Checkbox, NativeSelect, Stack, Text } from '@mantine/core';
import { useI18n } from '../../localisation/index.js';
import type { ReleaseSchedule } from '../../shared/schedule.js';
import { safeTimezone } from '../../shared/schedule.js';
export function ReleaseSchedulePicker({
  value,
  onChange,
  timezone,
  disabled,
}: {
  value: ReleaseSchedule | null;
  onChange: (value: ReleaseSchedule | null) => void;
  timezone: string;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  const initial: ReleaseSchedule = {
    frequency: 'daily',
    hour: 12,
    weekday: null,
    month_day: null,
    timezone: safeTimezone(timezone),
  };
  return (
    <Stack gap="sm">
      <Checkbox
        label={t('publishing.schedule')}
        checked={value !== null}
        onChange={(e) => onChange(e.currentTarget.checked ? initial : null)}
        disabled={disabled}
      />
      {value && (
        <>
          <NativeSelect
            label={t('schedule.frequency')}
            value={value.frequency}
            data={(['daily', 'weekly', 'monthly'] as const).map((frequency) => ({
              value: frequency,
              label: t(`schedule.${frequency}`),
            }))}
            disabled={disabled}
            onChange={(e) => {
              const frequency = e.currentTarget.value as ReleaseSchedule['frequency'];
              onChange({
                ...value,
                frequency,
                weekday: frequency === 'weekly' ? 0 : null,
                month_day: frequency === 'monthly' ? 1 : null,
              });
            }}
          />
          <NativeSelect
            label={t('schedule.hour')}
            value={value.hour}
            data={Array.from({ length: 24 }, (_, hour) => ({
              value: String(hour),
              label: `${String(hour).padStart(2, '0')}:00`,
            }))}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, hour: Number(e.currentTarget.value) })}
          />
          {value.frequency === 'weekly' && (
            <NativeSelect
              label={t('schedule.weekday')}
              value={value.weekday ?? 0}
              data={Array.from({ length: 7 }, (_, day) => ({
                value: String(day),
                label: new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
                  new Date(Date.UTC(2023, 0, 1 + day)),
                ),
              }))}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, weekday: Number(e.currentTarget.value) })}
            />
          )}
          {value.frequency === 'monthly' && (
            <NativeSelect
              label={t('schedule.month_day')}
              value={value.month_day ?? 1}
              data={Array.from({ length: 31 }, (_, index) => ({
                value: String(index + 1),
                label: String(index + 1),
              }))}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, month_day: Number(e.currentTarget.value) })}
            />
          )}
          <Text size="sm" c="dimmed">
            {t('schedule.zone', { zone: value.timezone })}
          </Text>
          <Text size="xs" c="dimmed">
            {t('schedule.calendar_help')}
          </Text>
        </>
      )}
    </Stack>
  );
}
