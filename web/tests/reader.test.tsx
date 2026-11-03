import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/server/render.js';
import { pagePropsSchema } from '../src/shared/contracts.js';
import { readingStateSchema, readerSettingsSchema } from '../src/shared/reader.js';
const props = pagePropsSchema.parse({
  page: 'reader',
  siteName: 'Fixture',
  signupMode: 'open',
  mailEnabled: false,
  user: null,
  section: 'work_fixture/node_one',
  reader: {
    work: 'work_fixture',
    story_title: 'Story',
    chapter: {
      uid: 'node_one',
      kind: 'chapter',
      title: 'Chapter one',
      synopsis: '',
      disclosures: ['gore', 'assault', 'sexual_content'],
    },
    chapters: [
      { uid: 'node_one', kind: 'chapter', title: 'Chapter one', synopsis: '' },
      { uid: 'node_two', kind: 'chapter', title: 'Chapter two', synopsis: '' },
    ],
    body: {
      document: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Escaped <script> manuscript' }] },
        ],
      },
      language: 'en',
      revision: 1,
      released_at: 100,
      updated_at: 100,
    },
  },
  reactions: {
    revision: 0,
    show_titles: true,
    reactions: [{ id: 'upvote', title: 'Upvote', image: '/assets/reactions/1f44d.png' }],
  },
});
test('reader SSR places detailed notices before escaped manuscript and supports chapter navigation', () => {
  const html = render(props);
  assert.match(html, /Escaped &lt;script&gt; manuscript/);
  assert.match(html, /href="\/read\/work_fixture\/node_two"/);
  const notice = 'The author has indicated that this chapter contains depictions of assault';
  assert.ok(html.indexOf(notice) > 0 && html.indexOf(notice) < html.indexOf('<article'));
  assert.match(html, /aria-label="Chapter navigation"/);
  assert.match(html, /Reader settings/);
  assert.match(html, /\/assets\/reactions\/1f44d.png/);
  assert.ok(!html.includes('PRIVATE_AUTHOR_NOTE'));
});
test('downloadable readers reject personalized SSR and private manuscript fields', () => {
  assert.equal(pagePropsSchema.safeParse({ ...props, permissions: ['administer'] }).success, false);
  assert.equal(
    pagePropsSchema.safeParse({
      ...props,
      reader: {
        ...props.reader,
        body: { ...props.reader!.body, chapter_note: 'PRIVATE_AUTHOR_NOTE' },
      },
    }).success,
    false,
  );
  assert.equal(pagePropsSchema.safeParse({ ...props, page: 'home' }).success, false);
});
test('reader device preferences, position and feedback reject invalid values', () => {
  for (const patch of [
    { position: 1.1 },
    { rating: 6 },
    { reactions: Array(7).fill('upvote') },
    { revision: -1 },
  ])
    assert.equal(
      readingStateSchema.safeParse({
        revision: 0,
        position: 0,
        reactions: [],
        rating: null,
        updated_at: 0,
        ...patch,
      }).success,
      false,
    );
  assert.equal(
    readerSettingsSchema.safeParse({
      size: 999,
      font: 'script',
      spacing: 0,
      width: 1,
      theme: 'unknown',
      speed: 10,
    }).success,
    false,
  );
});

test('chapter artwork is an unblurred hero immediately after the reader header with escaped synopsis', () => {
  const html = render({
    ...props,
    reader: {
      ...props.reader!,
      chapter: {
        ...props.reader!.chapter,
        cover: 'asset_chapter',
        synopsis: 'A brief <script> synopsis',
      },
    },
  }).replace(/data-page-props="[^"]*"/, '');
  assert.match(html, /<\/header><section class="reader-chapter-hero"/);
  assert.match(html, /url\(&quot;\/media\/asset_chapter&quot;\)/);
  assert.match(html, /A brief &lt;script&gt; synopsis/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /public-story-blurred|mature-obscured|discovery-cover-blurred/);
  assert.ok(html.indexOf('reader-chapter-hero') < html.indexOf('Chapter content disclosures'));
  assert.ok(html.indexOf('Chapter content disclosures') < html.indexOf('reader-prose'));
  const plain = render(props).replace(/data-page-props="[^"]*"/, '');
  assert.doesNotMatch(plain, /reader-chapter-hero/);
  assert.equal((plain.match(/<h1\b/g) ?? []).length, 1);
});
