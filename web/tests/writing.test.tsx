import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSchema } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { RichDocument, wordCount } from '../src/editor/document.js';
import { writingChecks } from '../src/editor/checks.js';
import { findMatches } from '../src/editor/find.js';
import { readRecovery, recoveryKey } from '../src/editor/recovery.js';
import { manuscriptSchema, safeLink } from '../src/shared/writing.js';
import { render } from '../src/server/render.js';
import { pagePropsSchema } from '../src/shared/contracts.js';
const value = manuscriptSchema.parse({
  language: 'en',
  notes: [],
  document: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'The ' },
          { type: 'text', text: 'bright ', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'door opened.' },
        ],
      },
    ],
  },
});
test('rich-text SSR escapes manuscript text and excludes active markup and unsafe links', () => {
  const html = renderToStaticMarkup(
    <RichDocument
      document={{
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '<script>text</script>',
                marks: [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
          { type: 'horizontalRule' },
        ],
      }}
    />,
  );
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>/);
  assert.match(html, /<hr/);
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('<script>'));
  for (const bad of [
    'javascript:alert(1)',
    '//evil.test',
    'data:text/html,unsafe',
    '/\\evil.test',
    'https://user:secret@example.test',
  ])
    assert.ok(!safeLink(bad));
  assert.ok(safeLink('/stories/example'));
  assert.ok(safeLink('https://example.test'));
  assert.throws(() => manuscriptSchema.parse({ ...value, document: { type: 'iframe' } }));
});
test('find crosses inline formatting, treats patterns literally and uses stable document positions', () => {
  const schema = getSchema([StarterKit]);
  const doc = schema.nodeFromJSON(value.document);
  const matches = findMatches(doc, 'bright door', false);
  assert.deepEqual(matches, [{ from: 5, to: 16 }]);
  assert.equal(doc.textBetween(matches[0]!.from, matches[0]!.to), 'bright door');
  assert.equal(findMatches(doc, 'BRIGHT', false).length, 1);
  assert.equal(findMatches(doc, 'BRIGHT', true).length, 0);
  assert.equal(findMatches(doc, '.*', false).length, 0);
  const replacement = schema.text('<literal>');
  assert.equal(replacement.text, '<literal>');
});
test('word counts segment Japanese and Chinese and writing checks identify actionable issues', () => {
  assert.equal(wordCount(value.document, 'en'), 4);
  assert.ok(
    wordCount(
      {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '今日は素晴らしい日です。' }] },
        ],
      },
      'ja',
    ) > 1,
  );
  assert.ok(
    wordCount(
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '这是一个美好的故事。' }] }],
      },
      'zh',
    ) > 1,
  );
  const issues = writingChecks(
    {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'Skipped' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'The the  story has a apple!!!' }] },
      ],
    },
    'en',
  );
  for (const key of ['repeated', 'spacing', 'article', 'punctuation', 'heading'])
    assert.ok(issues.some((i) => i.key === `editor.check.${key}`));
});
test('device recovery is scoped to user/work/chapter and expires without overwriting server state', () => {
  const storage = new Map<string, string>();
  const adapter = {
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => {
      storage.delete(key);
    },
  };
  const key = recoveryKey('owner', 'work', 'chapter');
  assert.notEqual(key, recoveryKey('other', 'work', 'chapter'));
  storage.set(key, JSON.stringify({ base_revision: 3, saved_at: 100000, value }));
  assert.equal(readRecovery(adapter, key, 100000)?.base_revision, 3);
  assert.equal(readRecovery(adapter, key, 100000 + 7 * 86400000 + 1), null);
  assert.ok(!storage.has(key));
  storage.set(key, '{malformed');
  assert.equal(readRecovery(adapter, key), null);
});
test('chapter manuscript and tools are present in the first server-rendered response', () => {
  const html = render(
    pagePropsSchema.parse({
      page: 'chapter',
      siteName: 'Example',
      signupMode: 'open',
      mailEnabled: false,
      user: {
        uid: 'usr_owner',
        display_name: 'Writer',
        group_key: 'author',
        email_verified: true,
        avatar_url: 'https://www.gravatar.com/avatar/example',
      },
      studio: {
        list: null,
        work: {
          work: {
            uid: 'work_example',
            owner: 'usr_owner',
            title: 'A work',
            subtitle: '',
            synopsis: '',
            work_type: 'book',
            status: 'draft',
            created_at: 0,
            updated_at: 0,
            revision: 1,
          },
          can_edit: true,
          can_share: true,
          shares: [],
        },
        artwork: {},
        default_artwork: {
          cover_url: '/assets/default-cover.svg',
          hero_url: null,
          palette: ['#24675a'],
        },
        editor: {
          chapter: { uid: 'node_example', kind: 'chapter', title: 'Opening', synopsis: '' },
          draft: { revision: 1, value, updated_at: 1, author_name: 'Writer' },
          can_edit: true,
        },
      },
    }),
  );
  assert.match(html, /<title>Opening • Example<\/title>/);
  assert.match(html, /<strong>bright /);
  assert.match(html, /Revision history/);
  assert.match(html, /Chapter note/);
  assert.ok(!html.includes('mantine-AppShell-navbar'));
  assert.ok(!html.includes('mantine-AppShell-header'));
  assert.match(html, /writing-dock/);
  assert.match(html, /Save draft/);
  assert.ok(
    !html.includes('contenteditable="true"'),
    'SSR serves safe prose before activating Tiptap in the browser',
  );
});

test('legacy chapter notes are retained as one outline while passage anchors remain independent', () => {
  const uid = 'e12a1c84-8a0c-445f-930a-d752e7e84d18';
  const migrated = manuscriptSchema.parse({
    ...value,
    chapter_note: 'Outline',
    notes: [
      { uid, text: 'Older planning note', anchor: null },
      {
        uid: '29b98bfb-8200-43e9-8793-086dd6205905',
        text: 'Passage',
        anchor: { from: 1, to: 4, quote: 'The', detached: false },
      },
    ],
  });
  assert.equal(migrated.chapter_note, 'Outline\n\nOlder planning note');
  assert.equal(migrated.notes.length, 1);
  assert.equal(manuscriptSchema.parse(migrated).chapter_note, migrated.chapter_note);
});

test('revision highlights preserve rich formatting and escaped text across blocks and marks', async () => {
  const { revisionHighlights } = await import('../src/editor/revision-diff.js');
  const before = manuscriptSchema.parse({
    ...value,
    document: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Opening' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'The old ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'door opened.' },
          ],
        },
        { type: 'horizontalRule' },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '古い物語。' }] }],
        },
      ],
    },
  });
  const after = manuscriptSchema.parse({
    ...before,
    document: {
      ...before.document,
      content: [
        before.document.content![0]!,
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'The new ', marks: [{ type: 'italic' }] },
            { type: 'text', text: 'door opened. <script>' },
          ],
        },
        before.document.content![2]!,
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '新しい物語。' }] }],
        },
      ],
    },
  });
  const highlights = revisionHighlights(before.document, after.document);
  assert.ok(highlights);
  const oldHTML = renderToStaticMarkup(
    <RichDocument document={before.document} highlights={highlights.before} />,
  );
  const newHTML = renderToStaticMarkup(
    <RichDocument document={after.document} highlights={highlights.after} />,
  );
  assert.match(oldHTML, /<strong>The <del>old<\/del> /);
  assert.match(newHTML, /<em>The <ins>new<\/ins> /);
  assert.match(newHTML, /<h2>Opening<\/h2>/);
  assert.match(newHTML, /<blockquote><p>/);
  assert.match(newHTML, /<ins>.*&lt;script&gt;/);
  assert.ok(!newHTML.includes('<script>'));
  assert.ok(!newHTML.includes('contenteditable'));
  assert.deepEqual(revisionHighlights(before.document, before.document), { before: [], after: [] });
});
