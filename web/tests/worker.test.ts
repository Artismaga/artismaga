import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
test('worker uses private JSON-lines pipes and recovers from invalid requests', async (t) => {
  const child = spawn(process.execPath, ['dist/server/worker.js'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  t.after(() => {
    child.kill();
  });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  async function read(): Promise<unknown> {
    const result = await lines.next();
    assert.ok(!result.done);
    const value: unknown = JSON.parse(result.value);
    return value;
  }
  assert.deepEqual(await read(), { ready: true });
  child.stdin.write('invalid-json\n');
  assert.deepEqual(await read(), { error: 'Rendering request failed' });
  child.stdin.write(
    JSON.stringify({
      page: 'home',
      siteName: 'Artismaga',
      signupMode: 'disabled',
      user: null,
      mailEnabled: false,
    }) + '\n',
  );
  const value = await read();
  assert.ok(
    typeof value === 'object' &&
      value !== null &&
      'html' in value &&
      typeof value.html === 'string',
  );
  assert.ok(!value.html.includes('>Featured / recommended stories<'));
  assert.match(value.html, /Popular stories/);
  const exit = once(child, 'exit');
  child.stdin.end();
  await exit;
  assert.equal(child.exitCode, 0);
});
