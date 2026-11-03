import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCount, elapsedMonths } from '../src/shared/engagement.js';
import { render } from '../src/server/render.js';
import { pagePropsSchema } from '../src/shared/contracts.js';
import { storySchema } from '../src/shared/discovery.js';
test('reaction counts have compact suffixes and inactivity respects whole calendar months', () => {
  assert.equal(compactCount(1300), '1.3k');
  assert.equal(compactCount(1_000_000), '1m');
  assert.equal(compactCount(999), '999');
  const start = Date.parse('2026-01-02T00:00:00Z') / 1000;
  assert.equal(elapsedMonths(start, Date.parse('2026-05-01T00:00:00Z') / 1000), 3);
  assert.equal(elapsedMonths(start, Date.parse('2026-05-02T00:00:00Z') / 1000), 4);
});
const story = storySchema.parse({
  uid: 'work_fixture',
  author: 'usr_author',
  author_name: 'Writer',
  title: 'Readable story',
  subtitle: '',
  synopsis: 'Synopsis',
  cover: 'asset_cover',
  hero: 'asset_hero',
  details: {
    nodes: [
      { uid: 'node_published', kind: 'chapter', title: 'Released chapter', synopsis: '' },
      { uid: 'node_private', kind: 'chapter', title: 'Unreleased chapter', synopsis: '' },
    ],
  },
  language: 'en',
  status: 'ongoing',
  mature: false,
  featured: false,
  first_published: 100,
  updated_at: 100,
  latest_chapter_release: 100,
  completed_at: null,
  chapter_dates: { node_published: { body_revision: 1, released_at: 100, updated_at: 100 } },
});
const props = pagePropsSchema.parse({
  page: 'home',
  siteName: 'Fixture',
  signupMode: 'open',
  user: null,
  mailEnabled: false,
  discovery: { stories: [story], genres: [], mature_content: 'show', scores: { work_fixture: 25 } },
});
test('Discovery hides an empty featured section and populates Popular from measured scores', () => {
  const html = render(props).replace(/data-page-props="[^"]*"/, '');
  assert.ok(!html.includes('Featured / recommended stories'));
  assert.match(html, />Popular<\/h2>/);
  assert.match(html, /Readable story/);
});
test('public catalogues hide unreleased chapters and display inactivity and hiatus notices', () => {
  const overview = render({ ...props, page: 'story', section: story.uid }).replace(
    /data-page-props="[^"]*"/,
    '',
  );
  assert.match(overview, /Released chapter/);
  assert.ok(!overview.includes('Unreleased chapter'));
  assert.match(overview, /may have been abandoned/);
  const hiatus = render({
    ...props,
    page: 'story',
    section: story.uid,
    discovery: { ...props.discovery, stories: [{ ...story, status: 'hiatus', hiatus_until: 100 }] },
  }).replace(/data-page-props="[^"]*"/, '');
  assert.match(hiatus, /hiatus is taking longer than expected/);
  assert.ok(!hiatus.includes('may have been abandoned'));
});

test('Continue reading links to the viewer chapter with a progress line and rejects guest history', () => {
  const discovery = {
    ...props.discovery,
    continue_reading: {
      work_fixture: {
        work: 'work_fixture',
        chapter: 'node_published',
        position: 0.42,
        updated_at: 200,
      },
    },
  };
  assert.equal(pagePropsSchema.safeParse({ ...props, discovery }).success, false);
  const user = {
    uid: 'usr_reader',
    display_name: 'Reader',
    group_key: 'reader',
    email_verified: true,
    avatar_url: 'https://www.gravatar.com/avatar/00000000000000000000000000000000',
  };
  const html = render({ ...props, user, discovery }).replace(/data-page-props="[^"]*"/, '');
  assert.match(html, /Continue reading/);
  assert.match(html, /href="\/read\/work_fixture\/node_published"/);
  assert.match(html, /continue-progress/);
  assert.match(html, /aria-valuenow="42"/);
});
