import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticRoles } from '../src/theme/theme.js';
import { orderedChapters } from '../src/pages/studio/Chapters.js';
import { targetAudienceSchema, detailsSchema, nodeSchema } from '../src/shared/creative.js';
const luminance = (hex: string) => {
  const c = [1, 3, 5]
    .map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722;
};
test('surface, border and text roles follow the site seed in both schemes with readable text', () => {
  for (const dark of [false, true]) {
    const blue = semanticRoles('#2358a0', dark);
    const red = semanticRoles('#9a263c', dark);
    for (const role of [
      '--surface',
      '--surface-container',
      '--surface-low',
      '--surface-high',
      '--outline',
      '--ink',
      '--muted',
    ])
      assert.notEqual(blue[role], red[role]);
    for (const seed of ['#2358a0', '#9a263c', '#050505', '#ffffff', '#24675a']) {
      const roles = semanticRoles(seed, dark);
      for (const bg of ['--surface', '--surface-container', '--surface-high'])
        for (const fg of ['--ink', '--muted']) {
          const a = luminance(roles[bg]!);
          const b = luminance(roles[fg]!);
          assert.ok(
            (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
            `${seed} ${bg} ${fg}`,
          );
        }
    }
  }
});
test('chapter numbers follow tree reading order and ignore archived chapters', () => {
  const nodes = [
    { uid: 'late', kind: 'chapter', parent: 'arc', title: 'Late' },
    { uid: 'v', kind: 'volume', title: 'Volume' },
    { uid: 'arc', kind: 'arc', parent: 'v', title: 'Arc' },
    { uid: 'first', kind: 'chapter', title: 'First' },
    { uid: 'archived', kind: 'chapter', title: 'Archived', delete_after: 123 },
  ].map((n) => nodeSchema.parse({ synopsis: '', ...n }));
  assert.deepEqual(
    orderedChapters(nodes).map((n) => n.uid),
    ['late', 'first'],
  );
});

test('target audience supports unspecified and open-ended ages and rejects invalid ranges', () => {
  for (const value of [
    { minimum_age: null, maximum_age: null },
    { minimum_age: 18, maximum_age: null },
    { minimum_age: 0, maximum_age: 12 },
    { minimum_age: null, maximum_age: 12 },
  ])
    assert.ok(targetAudienceSchema.safeParse(value).success);
  for (const value of [
    { minimum_age: 18, maximum_age: 12 },
    { minimum_age: -1, maximum_age: null },
    { minimum_age: 12.5, maximum_age: 18 },
    { minimum_age: 0, maximum_age: 121 },
  ])
    assert.ok(!targetAudienceSchema.safeParse(value).success);
  assert.deepEqual(detailsSchema.parse({ revision: 0, value: {} }).value.target_audience, {
    minimum_age: null,
    maximum_age: null,
  });
});
