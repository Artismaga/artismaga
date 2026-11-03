import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { Roles } from '../src/pages/admin/Roles.js';
import { Audience } from '../src/pages/studio/Audience.js';
import { detailsSchema } from '../src/shared/creative.js';
import { AnnouncementBanner } from '../src/components/Announcements.js';
import { siteConfigurationSchema } from '../src/shared/settings.js';
import { selectedTheme, availableThemes } from '../src/shared/theme-selection.js';
import { announcementSchema } from '../src/shared/announcements.js';
test('disabled user themes fall back while administrators can preview them', () => {
  const site = siteConfigurationSchema.parse({
    site_name: 'Example',
    tagline: 'Hello',
    description: '',
    announcement: '',
    support_url: '',
    default_language: 'en',
    timezone: 'UTC',
    signup_mode: 'open',
    default_group: 'reader',
  });
  site.themes.dark.enabled = false;
  assert.equal(selectedTheme('dark', site, false), 'light');
  assert.equal(selectedTheme('dark', site, true), 'dark');
  assert.ok(!availableThemes(site, false).includes('dark'));
});
test('promotion and critical notice HTML are rendered with safe text and dismissal controls', () => {
  const announcement = announcementSchema.parse({
    uid: 'ann_test',
    revision: 1,
    creator: 'owner',
    created_at: 0,
    cancelled: false,
    value: {
      kind: 'promotion',
      severity: 'info',
      title: '<script>unsafe</script>',
      description: 'A new story',
      image: 'asset_test',
      cta_text: 'Read now',
      cta_url: '/stories/test',
      dismissible: true,
      starts_at: null,
      ends_at: null,
      audience: 'everyone',
      roles: [],
    },
  });
  const html = renderToStaticMarkup(
    <MantineProvider>
      <AnnouncementBanner item={announcement} />
    </MantineProvider>,
  );
  assert.ok(html.includes('promotion-image'));
  assert.ok(html.includes('href="/stories/test"'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>unsafe'));
  announcement.value.kind = 'notice';
  announcement.value.severity = 'critical';
  assert.ok(
    renderToStaticMarkup(
      <MantineProvider>
        <AnnouncementBanner item={announcement} />
      </MantineProvider>,
    ).includes('role="alert"'),
  );
});

test('image-only promotions have one accessible banner link without title or CTA button', () => {
  const item = announcementSchema.parse({
    uid: 'ann_image',
    revision: 1,
    creator: 'owner',
    created_at: 0,
    cancelled: false,
    value: {
      kind: 'promotion',
      severity: 'info',
      title: '',
      description: '',
      image: 'asset_test',
      cta_text: '',
      cta_url: '/stories/art',
      dismissible: false,
      starts_at: null,
      ends_at: null,
      audience: 'everyone',
      roles: [],
    },
  });
  const html = renderToStaticMarkup(
    <MantineProvider>
      <AnnouncementBanner item={item} />
    </MantineProvider>,
  );
  assert.match(html, /class="promotion-link"/);
  assert.match(html, /aria-label="View promotion"/);
  assert.match(html, /href="\/stories\/art"/);
  assert.ok(!html.includes('promotion-copy'));
  assert.ok(!html.includes('<button'));
});
test('protected role navigation shows a disabled editor and expanded permission groups', () => {
  const html = renderToStaticMarkup(
    <MantineProvider>
      <Roles
        roles={[
          { key: 'administrator', name: 'Administrator', permissions: ['administer'], revision: 0 },
          { key: 'reader', name: 'Reader', permissions: ['comment'], revision: 0 },
        ]}
        onChange={() => {}}
      />
    </MantineProvider>,
  );
  assert.match(html, /<nav/);
  assert.match(html, /<fieldset disabled=""/);
  assert.match(html, /Create role/);
  assert.match(html, /Community/);
  assert.match(html, /name="manage_announcements"/);
  assert.match(html, /name="view_analytics"/);
});
test('audience age inputs are server rendered and respect read-only work access', () => {
  const html = renderToStaticMarkup(
    <MantineProvider>
      <Audience
        details={detailsSchema.parse({
          revision: 1,
          value: { target_audience: { minimum_age: 13, maximum_age: 17 } },
        })}
        change={async () => false}
        canEdit={false}
        busy={false}
      />
    </MantineProvider>,
  );
  assert.match(html, /Target audience/);
  assert.match(html, /value="13"/);
  assert.match(html, /value="17"/);
  assert.match(html, /disabled/);
});
