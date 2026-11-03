import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(
  new URL('../../crates/web/assets/reader-sw.js', import.meta.url),
  'utf8',
);
function worker() {
  type Event = {
    data?: unknown;
    ports?: { postMessage: (value: unknown) => void }[];
    request?: Request;
    waitUntil?: (value: Promise<unknown>) => void;
    respondWith?: (value: Promise<Response>) => void;
  };
  const handlers: Record<string, (event: Event) => void> = {};
  const entries = new Map<string, Map<string, Response>>();
  const requests: string[] = [];
  let offline = false;
  const normalize = (key: string | Request) =>
    new URL(typeof key === 'string' ? key : key.url, 'https://fiction.test').pathname;
  const context = vm.createContext({
    URL,
    crypto,
    Response,
    self: {
      location: { origin: 'https://fiction.test' },
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
      addEventListener: (name: string, handler: (event: Event) => void) => {
        handlers[name] = handler;
      },
    },
    caches: {
      keys: async () => [...entries.keys()],
      has: async (name: string) => entries.has(name),
      delete: async (name: string) => entries.delete(name),
      open: async (name: string) => {
        if (!entries.has(name)) entries.set(name, new Map());
        return {
          put: async (key: string, response: Response) => {
            entries.get(name)!.set(normalize(key), response.clone());
          },
          match: async (key: string | Request) => entries.get(name)!.get(normalize(key))?.clone(),
        };
      },
    },
    fetch: async (key: string | Request, options?: RequestInit) => {
      requests.push(normalize(key));
      if (offline) throw Error('Disconnected');
      assert.equal(options?.credentials, 'omit');
      return new Response(`public:${normalize(key)}`);
    },
  });
  vm.runInContext(source, context);
  return {
    entries,
    requests,
    disconnect: () => {
      offline = true;
    },
    message: async (data: unknown) => {
      let pending: Promise<unknown> | undefined;
      let reply: unknown;
      handlers['message']!({
        data,
        ports: [
          {
            postMessage: (value) => {
              reply = value;
            },
          },
        ],
        waitUntil: (value) => {
          pending = value;
        },
      });
      await pending;
      return reply as { ok: boolean; downloaded?: boolean };
    },
    fetch: async (path: string) => {
      let response: Promise<Response> | undefined;
      handlers['fetch']!({
        request: new Request(`https://fiction.test${path}`),
        respondWith: (value) => {
          response = value;
        },
      });
      return response;
    },
  };
}
const path =
  '/read/work_00000000-0000-4000-8000-000000000001/node_00000000-0000-4000-8000-000000000001';
test('explicit downloads cache only public allowlisted assets, reopen offline and clear contents', async () => {
  const w = worker();
  assert.equal(
    (
      await w.message({
        action: 'download',
        path,
        images: [
          '/api/account/export',
          'https://tracker.test/image.png',
          '/assets/reactions/1f44d.png',
        ],
      })
    ).ok,
    true,
  );
  assert.deepEqual(w.requests, [
    path,
    '/assets/theme.css',
    '/assets/client.js',
    '/assets/reactions/1f44d.png',
  ]);
  assert.equal(await w.fetch('/api/account/export'), undefined);
  assert.equal(await w.fetch('/studio/private'), undefined);
  w.disconnect();
  assert.equal(await (await w.fetch(path))!.text(), `public:${path}`);
  assert.equal((await w.message({ action: 'clear', path })).ok, true);
  assert.equal((await w.message({ action: 'status', path })).downloaded, false);
  assert.equal((await w.fetch(path))!.type, 'error');
});
test('invalid private paths and failed downloads do not create usable offline entries', async () => {
  const w = worker();
  assert.equal((await w.message({ action: 'download', path: '/account/settings' })).ok, false);
  assert.equal(w.entries.size, 0);
  w.disconnect();
  assert.equal((await w.message({ action: 'download', path })).ok, false);
  assert.equal(w.entries.size, 0);
});

test('offline downloads retain chapter hero artwork alongside all six reactions', async () => {
  const w = worker();
  const hero = '/media/asset_00000000-0000-4000-8000-000000000001';
  const images = ['1f44d', '1f923', '1f60d', '1f62f', '1f624', '1f62d'].map(
    (code) => `/assets/reactions/${code}.png`,
  );
  assert.equal((await w.message({ action: 'download', path, images: [...images, hero] })).ok, true);
  w.disconnect();
  assert.equal(await (await w.fetch(hero))!.text(), `public:${hero}`);
  assert.equal(
    (await w.message({ action: 'download', path, images: [...images, hero, hero] })).ok,
    false,
  );
});
