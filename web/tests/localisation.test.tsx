import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render } from '../src/server/render.js';
import { pagePropsSchema } from '../src/shared/contracts.js';
import { formatMessage } from '../src/localisation/index.js';
const definitions = JSON.parse(
  readFileSync(new URL('../../crates/localisation/data/keys.json', import.meta.url), 'utf8'),
) as { key: string; defaults: Record<string, string> }[];
test('all five locales render translated controls on the server with escaped placeholders', () => {
  for (const locale of ['en', 'ja', 'zh', 'es', 'fr']) {
    const messages = Object.fromEntries(definitions.map((d) => [d.key, d.defaults[locale]]));
    const props = pagePropsSchema.parse({
      page: 'home',
      siteName: 'Example',
      signupMode: 'open',
      user: null,
      mailEnabled: false,
      localisation: {
        locale,
        source_locale: 'en',
        enabled: ['en', 'ja', 'zh', 'es', 'fr'],
        messages,
        preview: false,
      },
    });
    const html = render(props);
    assert.ok(html.includes(`lang="${locale}"`));
    assert.ok(html.includes(messages['ui.sign_in_bfd402b2']!));
  }
  assert.equal(formatMessage('Hello {name}', { name: '{other}' }), 'Hello {other}');
});
test('renderer rejects draft editor data without localisation permission', () => {
  assert.throws(() =>
    pagePropsSchema.parse({
      page: 'home',
      siteName: 'Example',
      signupMode: 'open',
      user: null,
      mailEnabled: false,
      localisation_editor: { draft: 'private' },
    }),
  );
});

test('announcement timestamps use the configured zone regardless of server time zone', async () => {
  const { formatDate } = await import('../src/localisation/dates.js');
  const epoch = Date.UTC(2026, 9, 29, 0, 30) / 1000;
  const user = {
    uid: 'usr_timezone',
    display_name: 'Editor',
    group_key: 'announcer',
    email_verified: true,
    avatar_url: 'https://www.gravatar.com/avatar/test',
  };
  const props = pagePropsSchema.parse({
    page: 'admin',
    section: 'announcements',
    siteName: 'Example',
    signupMode: 'open',
    mailEnabled: false,
    user,
    permissions: ['manage_announcements'],
    localisation: {
      locale: 'en',
      source_locale: 'en',
      enabled: ['en'],
      messages: {},
      preview: false,
      timezone: 'Asia/Tokyo',
      now: epoch,
    },
    announcements: [
      {
        uid: 'ann_timezone',
        revision: 1,
        creator: user.uid,
        created_at: epoch,
        cancelled: false,
        initiator: user,
        value: {
          kind: 'notice',
          severity: 'info',
          title: 'Notice',
          description: 'Time-zone regression',
          image: null,
          cta_text: '',
          cta_url: '',
          dismissible: false,
          starts_at: null,
          ends_at: null,
          audience: 'everyone',
          roles: [],
        },
      },
    ],
  });
  const expected = formatDate('en', 'Asia/Tokyo', epoch);
  const previous = process.env['TZ'];
  try {
    for (const zone of ['UTC', 'America/Los_Angeles']) {
      process.env['TZ'] = zone;
      assert.ok(render(props).includes(expected));
    }
  } finally {
    if (previous === undefined) delete process.env['TZ'];
    else process.env['TZ'] = previous;
  }
  assert.equal(formatDate('en', 'invalid/timezone', epoch), formatDate('en', 'UTC', epoch));
});
