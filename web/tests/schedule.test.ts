import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextRelease,
  releaseScheduleSchema,
  storedScheduleSchema,
} from '../src/shared/schedule.js';
import type { ReleaseSchedule } from '../src/shared/schedule.js';
import { audienceLabel } from '../src/pages/discovery/AudiencePill.js';
const daily: ReleaseSchedule = {
  frequency: 'daily',
  hour: 12,
  weekday: null,
  month_day: null,
  timezone: 'UTC',
};
const epoch = (date: string) => Date.parse(date) / 1000;
test('expected releases use calendar time, weekly DST changes, and short-month clamping', () => {
  assert.equal(nextRelease(daily, epoch('2026-01-01T10:00:00Z')), epoch('2026-01-01T12:00:00Z'));
  assert.equal(
    nextRelease(
      { ...daily, frequency: 'weekly', hour: 10, weekday: 1, timezone: 'America/New_York' },
      epoch('2026-10-30T12:00:00Z'),
    ),
    epoch('2026-11-02T15:00:00Z'),
  );
  assert.equal(
    nextRelease({ ...daily, frequency: 'monthly', month_day: 31 }, epoch('2026-01-31T13:00:00Z')),
    epoch('2026-02-28T12:00:00Z'),
  );
  assert.equal(
    nextRelease({ ...daily, timezone: 'Asia/Kathmandu' }, epoch('2026-01-01T05:00:00Z')),
    epoch('2026-01-01T06:15:00Z'),
  );
});
test('missing DST hours are skipped and repeated hours choose the next real occurrence', () => {
  assert.equal(
    nextRelease({ ...daily, hour: 2, timezone: 'America/New_York' }, epoch('2026-03-08T05:00:00Z')),
    epoch('2026-03-09T06:00:00Z'),
  );
  assert.equal(
    nextRelease({ ...daily, hour: 1, timezone: 'America/New_York' }, epoch('2026-11-01T05:30:00Z')),
    epoch('2026-11-01T06:00:00Z'),
  );
});
test('structured schedules reject invalid frequency fields and legacy text is not interpreted as a calendar', () => {
  assert.ok(!releaseScheduleSchema.safeParse({ ...daily, frequency: 'weekly' }).success);
  assert.ok(!releaseScheduleSchema.safeParse({ ...daily, hour: 24 }).success);
  assert.ok(
    !releaseScheduleSchema.safeParse({ ...daily, frequency: 'monthly', month_day: 32 }).success,
  );
  assert.equal(storedScheduleSchema.parse('Previously entered free text'), null);
  assert.equal(
    nextRelease({ ...daily, timezone: 'Imaginary/City' }, epoch('2026-01-01T00:00:00Z')),
    null,
  );
});
test('audience pills distinguish open lower and upper bounds', () => {
  assert.equal(audienceLabel({ minimum_age: 18, maximum_age: null }), '18+');
  assert.equal(audienceLabel({ minimum_age: null, maximum_age: 12 }), '<12');
  assert.equal(audienceLabel({ minimum_age: 13, maximum_age: 18 }), '13–18');
});
