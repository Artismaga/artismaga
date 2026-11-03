import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/server/render.js';
import { pagePropsSchema } from '../src/shared/contracts.js';
const base = pagePropsSchema.parse({
  page: 'home',
  siteName: 'Artismaga',
  signupMode: 'invitation',
  mailEnabled: false,
  user: null,
});
test('renders React content and account forms before any browser JavaScript', () => {
  const html = render({ ...base, page: 'register' });
  assert.match(html, /<!doctype html>/);
  assert.match(html, /Join the story/);
  assert.match(html, /name="invitation"/);
  assert.match(html, /name="password"/);
  assert.match(html, /aria-live="polite"/);
});
test('escapes site/user values and rejects invalid IPC props', () => {
  const html = render({
    ...base,
    page: 'profile',
    siteName: '<script>alert(1)</script>',
    user: {
      uid: 'usr_test',
      display_name: '<img src=x onerror=alert(1)>',
      group_key: 'reader',
      avatar_url: 'https://www.gravatar.com/avatar/abc',
      email_verified: false,
    },
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;script&gt;/);
  assert.throws(() => render({ ...base, page: '../../file' }));
  assert.throws(() => render({ ...base, siteName: 123 }));
});
test('registration policy controls server HTML', () => {
  assert.ok(
    !render({ ...base, page: 'register', signupMode: 'disabled' }).includes(
      'data-api="/api/auth/register"',
    ),
  );
});
test('setup is a complete accessible wizard without embedded credentials', () => {
  const html = render({ ...base, page: 'setup' });
  for (const name of [
    'setup_code',
    'site_name',
    'public_url',
    'admin_email',
    'admin_password',
    'confirm_password',
    'mail_host',
  ])
    assert.match(html, new RegExp(`name="${name}"`));
  assert.equal((html.match(/data-step=/g) ?? []).length, 4);
  assert.match(html, /<legend>/);
  assert.match(html, /type="password"/);
  assert.match(html, /setup-review/);
  assert.ok(!html.includes('RENDERER_TOKEN'));
  assert.ok(!html.includes('SURREAL_PASS'));
});

test('Mantine styles are nonce scoped and page props cannot expose dashboard data publicly', () => {
  const html = render({ ...base, styleNonce: 'test-style-nonce' });
  const styleTags = html.match(/<style[^>]*>/g) ?? [];
  assert.ok(styleTags.length > 0);
  assert.ok(styleTags.every((tag) => tag.includes('nonce="test-style-nonce"')));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('>Featured / recommended stories<'));
  assert.match(html, /Popular stories/);
  assert.ok(!html.includes('<h1'));
  assert.match(html, /No published stories to show here yet/);
  assert.throws(() =>
    pagePropsSchema.parse({
      ...base,
      administrator: {
        settings: {
          revision: 0,
          configuration: {
            site_name: 'Artismaga',
            tagline: '',
            description: '',
            announcement: '',
            support_url: '',
            default_language: 'en',
            timezone: 'UTC',
            signup_mode: 'open',
            default_group: 'reader',
          },
        },
        users: [],
        mail_enabled: false,
        analytics_status: 'not_connected',
      },
    }),
  );
});

test('utility navigation lives in the dropdown and deep admin tabs render on the server', () => {
  const user = {
    uid: 'usr_fixture',
    display_name: 'Fixture owner',
    group_key: 'administrator',
    email_verified: true,
    avatar_url: 'https://www.gravatar.com/avatar/fixture',
  };
  const configuration = {
    site_name: 'Artismaga',
    tagline: 'Stories',
    description: '',
    announcement: '',
    support_url: '',
    default_language: 'en',
    timezone: 'UTC',
    signup_mode: 'open',
    default_group: 'reader',
  };
  const html = render({
    ...base,
    page: 'admin',
    section: 'roles',
    user,
    permissions: ['administer'],
    administrator: {
      settings: { revision: 0, configuration },
      users: [],
      roles: [
        { key: 'administrator', name: 'Administrator', permissions: ['administer'], revision: 0 },
      ],
      mail_enabled: false,
      analytics_status: 'not_connected',
      storage: null,
    },
  });
  const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
  assert.ok(
    nav.includes('Studio') && !nav.includes('Account settings') && !nav.includes('Administration'),
  );
  const active = (html.match(/<button[^>]+>/g) ?? []).find((tag) => tag.includes('-tab-roles'));
  assert.ok(active?.includes('aria-selected="true"'));
  assert.match(html, /protected Administrator role/);
});
test('Studio creation is server rendered with optional artwork and a disabled Book type', () => {
  const user = {
    uid: 'usr_fixture',
    display_name: 'Writer',
    group_key: 'author',
    email_verified: true,
    avatar_url: 'https://www.gravatar.com/avatar/fixture',
  };
  const html = render({
    ...base,
    page: 'new_work',
    user,
    permissions: ['create_story'],
    studio: {
      list: null,
      work: null,
      artwork: {},
      default_artwork: {
        cover_url: '/assets/default-cover.svg',
        hero_url: null,
        palette: ['#24675a', '#c4d9df', '#e8c9a7'],
      },
    },
  });
  assert.match(html, /Create a work/);
  assert.match(html, /Work Type/);
  assert.match(html, /Book/);
  assert.match(html, /Manga/);
  assert.match(html, /name="title"/);
  assert.match(html, /default cover/);
  assert.throws(() =>
    render({
      ...base,
      page: 'new_work',
      user: null,
      studio: {
        list: null,
        work: null,
        artwork: {},
        default_artwork: {
          cover_url: '/assets/default-cover.svg',
          hero_url: null,
          palette: ['#24675a'],
        },
      },
    }),
  );
});

test('each page gets a descriptive title and work chapters render as a recoverable hierarchy', () => {
  assert.match(render(base), /<title>Discover • Artismaga<\/title>/);
  assert.match(render({ ...base, page: 'login' }), /<title>Sign in • Artismaga<\/title>/);
  const props = pagePropsSchema.parse({
    ...base,
    page: 'work',
    section: 'chapters',
    user: {
      uid: 'usr_owner',
      display_name: 'Owner',
      group_key: 'administrator',
      email_verified: true,
      avatar_url: 'https://www.gravatar.com/avatar/test',
    },
    studio: {
      list: null,
      work: {
        work: {
          uid: 'work_test',
          owner: 'usr_owner',
          title: 'First Light',
          subtitle: '',
          synopsis: '',
          work_type: 'book',
          status: 'draft',
          cover: null,
          hero: null,
          created_at: 1,
          updated_at: 1,
          revision: 0,
        },
        can_edit: true,
        can_share: true,
        shares: [],
      },
      artwork: {
        work_test: { cover_url: '/assets/default-cover.svg', hero_url: null, palette: ['#24675a'] },
      },
      default_artwork: {
        cover_url: '/assets/default-cover.svg',
        hero_url: null,
        palette: ['#24675a'],
      },
      details: {
        revision: 1,
        value: {
          nodes: [
            {
              uid: 'v',
              kind: 'volume',
              parent: null,
              title: 'Volume One',
              synopsis: '',
              cover: null,
              delete_after: null,
            },
            {
              uid: 'a',
              kind: 'arc',
              parent: 'v',
              title: 'Arc One',
              synopsis: '',
              cover: null,
              delete_after: null,
            },
            {
              uid: 'c',
              kind: 'chapter',
              parent: 'a',
              title: 'Dawn',
              synopsis: 'An opening',
              cover: null,
              delete_after: null,
            },
            {
              uid: 'x',
              kind: 'chapter',
              parent: null,
              title: 'Archived scene',
              synopsis: '',
              cover: null,
              delete_after: 2000000000,
            },
          ],
          genres: [],
          tags: [],
          disclosures: {},
        },
      },
    },
  });
  const html = render(props);
  assert.match(html, /<title>Chapters · First Light • Artismaga<\/title>/);
  assert.match(html, /<details open="" class="chapter-group">/);
  assert.match(html, /Volume One/);
  assert.match(html, /Arc One/);
  assert.match(html, /Drag Dawn/);
  assert.match(html.replaceAll('<!-- -->', ''), /Chapter archive \(1\)/);
  assert.match(html, /Restore/);
  assert.ok(html.indexOf('Create chapter') < html.indexOf('chapter-branch'));
});
