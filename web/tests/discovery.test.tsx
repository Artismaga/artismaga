import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/server/render.js';
import { pagePropsSchema } from '../src/shared/contracts.js';
import { storySchema } from '../src/shared/discovery.js';
const story = storySchema.parse({
  chapter_dates: { chapter_one: { body_revision: 1, released_at: 1000, updated_at: 1000 } },
  uid: 'work_fixture',
  author: 'usr_writer',
  author_name: 'Writer',
  title: 'Published <script> title',
  subtitle: 'Subtitle',
  synopsis: 'Public synopsis',
  cover: 'asset_cover',
  hero: 'asset_hero',
  details: {
    nodes: [
      {
        uid: 'chapter_one',
        kind: 'chapter',
        title: 'First chapter',
        synopsis: 'Chapter summary',
        cover: 'asset_chapter',
      },
    ],
    genres: [{ genre: 'fantasy' }],
    target_audience: { minimum_age: 13, maximum_age: 18 },
  },
  language: 'en',
  status: 'ongoing',
  mature: true,
  featured: true,
  first_published: 1000,
  updated_at: 2000,
  latest_chapter_release: 1000,
  completed_at: null,
});
const base = pagePropsSchema.parse({
  page: 'home',
  siteName: 'Artismaga',
  signupMode: 'open',
  mailEnabled: false,
  user: null,
  discovery: {
    stories: [story],
    genres: [
      {
        key: 'fantasy',
        name: 'Fantasy',
        parent: null,
        colour: '#24675a',
        icon: 'book',
        image: 'asset_genre',
      },
    ],
    mature_content: 'blur',
  },
});
test('discovery renders explicit public snapshots and genre images before hydration', () => {
  const html = render(base);
  assert.match(html, /Featured \/ recommended stories/);
  assert.match(html, /href="\/discover\/genres\/fantasy"/);
  assert.match(html, /url\(&quot;\/media\/asset_genre/);
  assert.match(html, /Published &lt;script&gt; title/);
  assert.match(html, /discovery-cover-blurred/);
  assert.match(html, /Story actions/);
  assert.match(html, /Popular stories will appear/);
  assert.ok(!html.includes('>Continue reading<'));
});
test('public overview renders catalogue and disclosures without private DTO fields', () => {
  const html = render({ ...base, page: 'story', section: story.uid });
  for (const text of [
    'Public synopsis',
    'First chapter',
    'Chapter summary',
    'Recently released',
    'Not rated yet',
    '0 views',
    'Reviews',
    'Similar stories',
    '13–18',
  ])
    assert.ok(html.includes(text), text);
  assert.ok(!html.includes('<script> title'));
  assert.throws(() => storySchema.parse({ ...story, password_hash: 'secret' }));
  assert.throws(() =>
    storySchema.parse({ ...story, details: { ...story.details, chapter_note: 'private' } }),
  );
});
test('genre discovery is available to guests with server-rendered navigation', () => {
  const html = render({ ...base, page: 'genre', section: 'fantasy' });
  assert.match(html, />Fantasy</);
  assert.match(html, /Subgenres/);
  assert.match(html, /href="\/stories\/work_fixture"/);
});

test('genre shelves show cover/title/subtitle without byline or synopsis copy', () => {
  const html = render({ ...base, page: 'genre', section: 'fantasy' }).replace(
    /data-page-props="[^"]*"/,
    '',
  );
  assert.ok(!html.includes('Public synopsis'));
  assert.ok(!html.includes('>Writer<'));
  assert.match(html, /cover-pills/);
  assert.match(html, /cover-mature/);
});
test('featured carousel has navigation and no story context menu inside its region', () => {
  const html = render({
    ...base,
    discovery: { ...base.discovery, stories: [story, { ...story, uid: 'work_two' }] },
  });
  const featured =
    html.match(/<section class="story-shelf featured-shelf"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(featured, /Previous featured story/);
  assert.match(featured, /Next featured story/);
  assert.ok(!featured.includes('Story actions'));
});

test('discovery headings belong to shelves and mature artwork has an inert dismissible overlay', () => {
  const html = render(base).replace(/data-page-props="[^"]*"/, '');
  const headings = [...html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/g)].map((m) => m[1]);
  assert.ok(
    !headings.some((heading) => /Featured \/ recommended stories|Explore genres/.test(heading!)),
  );
  assert.match(html, /mature-warning/);
  assert.match(html, /mature-obscured discovery-cover-blurred" inert=""/);
  assert.match(html, /Dismiss notice and reveal artwork/);
  assert.ok(!html.includes('linear-gradient(rgb(0 0 0'));
  const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0] ?? '';
  const navbar = html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.ok(!header.includes('EARLY CHAPTERS'));
  assert.ok(!header.includes('Interface language'));
  assert.match(navbar, /Interface language/);
});

test('mature story chapter artwork stays blurred unless the viewer setting permits it', () => {
  const hidden = render({ ...base, page: 'story', section: story.uid });
  assert.match(hidden, /public-chapter-art public-chapter-art-blurred/);
  const visible = render({
    ...base,
    page: 'story',
    section: story.uid,
    discovery: { ...base.discovery, mature_content: 'show' },
  });
  assert.ok(!visible.includes('public-chapter-art-blurred'));
});

test('story hero starts the first released chapter and resumes the viewer chapter', () => {
  const first = render({ ...base, page: 'story', section: story.uid });
  assert.match(first, /Start Reading/);
  assert.match(first, /class="[^"]*story-reading-button/);
  const user = {
    uid: 'usr_reader',
    display_name: 'Reader',
    group_key: 'reader',
    email_verified: true,
    avatar_url: 'https://www.gravatar.com/avatar/00000000000000000000000000000000',
  };
  const resumed = render({
    ...base,
    user,
    page: 'story',
    section: story.uid,
    discovery: {
      ...base.discovery,
      continue_reading: {
        [story.uid]: { work: story.uid, chapter: 'chapter_one', position: 0.5, updated_at: 200 },
      },
    },
  });
  assert.match(resumed, /Continue Reading/);
  assert.match(resumed, /Ch\. 1/);
  assert.match(resumed, /href="\/read\/work_fixture\/chapter_one"/);
});
