import { z } from 'zod';
export const releaseScheduleSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    hour: z.number().int().min(0).max(23),
    weekday: z.number().int().min(0).max(6).nullable(),
    month_day: z.number().int().min(1).max(31).nullable(),
    timezone: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9/_+\-]+$/),
  })
  .strict()
  .refine((s) =>
    s.frequency === 'daily'
      ? s.weekday === null && s.month_day === null
      : s.frequency === 'weekly'
        ? s.weekday !== null && s.month_day === null
        : s.month_day !== null && s.weekday === null,
  );
export const storedScheduleSchema = z
  .preprocess((v) => (typeof v === 'string' ? null : v), releaseScheduleSchema.nullable())
  .default(null);
export type ReleaseSchedule = z.infer<typeof releaseScheduleSchema>;
export function safeTimezone(zone: string): string {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}
function parts(formatter: Intl.DateTimeFormat, epoch: number) {
  const p = Object.fromEntries(formatter.formatToParts(epoch).map((v) => [v.type, v.value]));
  return {
    year: Number(p['year']),
    month: Number(p['month']),
    day: Number(p['day']),
    hour: Number(p['hour']),
    minute: Number(p['minute']),
  };
}
/** Calendar recurrence in the author's zone. Skip missing DST hours; choose the next real occurrence of repeated hours. Monthly days clamp to month end. */
export function nextRelease(schedule: ReleaseSchedule, afterSeconds: number): number | null {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: schedule.timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
  } catch {
    return null;
  }
  const start = parts(formatter, afterSeconds * 1000);
  for (let day = 0; day < 63; day++) {
    const calendar = new Date(Date.UTC(start.year, start.month - 1, start.day + day));
    const year = calendar.getUTCFullYear(),
      month = calendar.getUTCMonth() + 1,
      date = calendar.getUTCDate();
    if (schedule.frequency === 'weekly' && calendar.getUTCDay() !== schedule.weekday) continue;
    const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (schedule.frequency === 'monthly' && date !== Math.min(schedule.month_day ?? 1, end))
      continue;
    const wall = Date.UTC(year, month - 1, date, schedule.hour);
    let guess = wall;
    for (let i = 0; i < 4; i++) {
      const p = parts(formatter, guess);
      guess += wall - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    }
    const candidates = [-7200000, -3600000, -1800000, 0, 1800000, 3600000, 7200000]
      .map((offset) => guess + offset)
      .filter((epoch) => {
        if (epoch <= afterSeconds * 1000) return false;
        const p = parts(formatter, epoch);
        return (
          p.year === year &&
          p.month === month &&
          p.day === date &&
          p.hour === schedule.hour &&
          p.minute === 0
        );
      });
    if (candidates.length) return Math.min(...candidates) / 1000;
  }
  return null;
}
export function countdown(seconds: number): string {
  const remaining = Math.max(0, Math.floor(seconds));
  const days = Math.floor(remaining / 86400),
    hours = Math.floor((remaining % 86400) / 3600),
    minutes = Math.floor((remaining % 3600) / 60);
  return `${days ? `${days}d ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
}
