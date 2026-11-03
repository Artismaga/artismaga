import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommentBody } from '../src/pages/comments/Body.js';
import { orderComments } from '../src/pages/comments/Comments.js';
import { commentSchema, discussionSchema, inboxSchema } from '../src/shared/community.js';
import { supportsKokoro } from '../src/pages/reader/useSpeech.js';
const row = (uid: string, parent: string | null = null, likes = 0, time = 1) =>
  commentSchema.parse({
    uid,
    parent,
    likes,
    account: 'usr_fixture',
    body: 'hello',
    gif: null,
    created_at: time,
    revision: 1,
    deleted: false,
    liked: false,
    name: 'Reader',
    avatar: '',
    manager: false,
    author: false,
  });
test('discussion sorts siblings while preserving reply threads and bounds malicious cycles', () => {
  const rows = [
    row('old', null, 1, 1),
    row('hot', null, 4, 2),
    row('reply', 'old', 100, 3),
    row('self', 'self'),
  ];
  assert.deepEqual(
    orderComments(rows, 'hot').map((r) => r.comment.uid),
    ['hot', 'old', 'reply'],
  );
  assert.deepEqual(
    orderComments(rows, 'oldest').map((r) => r.comment.uid),
    ['old', 'reply', 'hot'],
  );
  const deep = Array.from({ length: 100 }, (_, i) =>
    row(String(i), i === 0 ? null : String(i - 1)),
  );
  assert.equal(orderComments(deep, 'new').length, 100);
});
test('comment formatting escapes markup and uses bundled emoji images', () => {
  const html = renderToStaticMarkup(
    <CommentBody text={'<script>alert(1)</script> **bold** *italic* 😀'} />,
  );
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /\/assets\/reactions\/1f600.png/);
  assert.doesNotMatch(html, /<script/);
});
test('unknown IPC fields and caller GIF URLs cannot enter discussions', () => {
  assert.equal(
    discussionSchema.safeParse({
      comments: [],
      account: null,
      can_comment: false,
      can_manage: false,
      muted: [],
      secret: 'bad',
    }).success,
    false,
  );
  assert.equal(
    commentSchema.safeParse({ ...row('x'), gif: 'https://evil.example/a.gif' }).success,
    false,
  );
  assert.equal(
    inboxSchema.safeParse({
      account: 'x',
      notifications: [{ uid: 'x', thumbnail: 'javascript:bad' }],
    }).success,
    false,
  );
});
test('local speech checks actual English runtime support and conservative device limits', () => {
  assert.equal(supportsKokoro('en', { gpu: {}, hardwareConcurrency: 8, deviceMemory: 8 }), true);
  for (const language of ['ja', 'zh', 'fr', 'es'])
    assert.equal(supportsKokoro(language, { gpu: {}, hardwareConcurrency: 8 }), false);
  assert.equal(supportsKokoro('en', { hardwareConcurrency: 8 }), false);
  assert.equal(supportsKokoro('en', { gpu: {}, hardwareConcurrency: 2 }), false);
  assert.equal(supportsKokoro('en', { gpu: {}, hardwareConcurrency: 8, deviceMemory: 2 }), false);
  assert.equal(
    supportsKokoro('en', { gpu: {}, hardwareConcurrency: 8, connection: { saveData: true } }),
    false,
  );
});

test('worker deduplicates minute inbox polls and broadcasts no private payload', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const handlers: Record<
    string,
    (event: { data: unknown; waitUntil: (p: Promise<unknown>) => void }) => void
  > = {};
  let clock = 100000,
    calls = 0;
  const posted: unknown[] = [];
  const source = readFileSync(
    new URL('../../crates/web/assets/reader-sw.js', import.meta.url),
    'utf8',
  );
  const context = vm.createContext({
    Date: { now: () => clock },
    self: {
      addEventListener: (name: string, handler: (typeof handlers)[string]) => {
        handlers[name] = handler;
      },
      clients: {
        matchAll: async () => [
          { postMessage: (data: unknown) => posted.push(data) },
          { postMessage: (data: unknown) => posted.push(data) },
        ],
      },
    },
    fetch: async (path: string, options: { cache: string; credentials: string }) => {
      calls++;
      assert.equal(path, '/api/notifications');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.credentials, 'same-origin');
      return { ok: true, status: 200 };
    },
  });
  vm.runInContext(source, context);
  const tick = async () => {
    let pending: Promise<unknown> | undefined;
    handlers['message']?.({
      data: { action: 'notifications-poll' },
      waitUntil: (p) => {
        pending = p;
      },
    });
    await pending;
  };
  await tick();
  await tick();
  assert.equal(calls, 1);
  assert.equal(posted.length, 2);
  assert.equal(
    JSON.stringify(posted),
    JSON.stringify([{ type: 'notifications-updated' }, { type: 'notifications-updated' }]),
  );
  clock += 60000;
  await tick();
  assert.equal(calls, 2);
});

test('visual comment formatting round trips nested marks, literal markers, newlines and emoji', async () => {
  const { commentDocument, commentMarkdown } = await import('../src/pages/comments/document.js');
  for (const body of [
    '**bold *both* text** ||hidden|| 😀',
    'literal \\*asterisk\\* and \\|pipes\\|',
    'first\n\n*third*',
    '***both***',
    '**one*****two***',
    '||hidden **bold** 😀\nsecond line||',
  ]) {
    const parsed = commentDocument(body);
    const saved = commentMarkdown(parsed);
    assert.deepEqual(commentDocument(saved), parsed, body);
  }
  const html = renderToStaticMarkup(<CommentBody text={'***both*** literal \\*star\\*'} />);
  assert.match(html, /<strong><em>both<\/em><\/strong>/);
  assert.match(html, /literal \*star\*/);
});
test('all bundled emoji have authoritative categories and are available without a result cap', async () => {
  const { default: emoji } = await import('../src/shared/twemoji.json', { with: { type: 'json' } });
  const { emojiCategories } = await import('../src/pages/comments/EmojiPicker.js');
  const groups = new Set(emojiCategories.map(([category]) => category));
  assert.equal(emoji.length, 4009);
  assert.ok(
    emoji.every((item) => groups.has(item.category as (typeof emojiCategories)[number][0])),
  );
  for (const [category] of emojiCategories)
    assert.ok(
      emoji.some((item) => item.category === category),
      category,
    );
});
