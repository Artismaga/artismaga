/** App-owned SSR worker. stdout is a bounded JSON-lines protocol, never a log stream. */
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { ZodError } from 'zod';
import { render } from './render.js';
const MAX_REQUEST_BYTES = 2_097_152;
const MAX_RESPONSE_BYTES = 8_388_608;
// Bound memory before readline can buffer an arbitrarily long line.
let pendingBytes = 0;
process.stdin.on('data', (chunk: Buffer) => {
  for (const byte of chunk) {
    pendingBytes = byte === 10 ? 0 : pendingBytes + 1;
    if (pendingBytes > MAX_REQUEST_BYTES) {
      process.exitCode = 1;
      process.stdin.destroy();
      break;
    }
  }
});
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
process.stdout.write(JSON.stringify({ ready: true }) + '\n');
for await (const line of input) {
  let reply: string;
  try {
    const value: unknown = JSON.parse(line);
    reply = JSON.stringify({ html: render(value) });
    if (Buffer.byteLength(reply) > MAX_RESPONSE_BYTES)
      throw new Error('Response exceeds protocol limit');
  } catch (error: unknown) {
    if (error instanceof ZodError)
      console.error(
        'SSR schema rejected fields:',
        error.issues.map((issue) => issue.path.join('.')).join(', '),
      );
    else console.error('SSR rendering failed');
    reply = JSON.stringify({ error: 'Rendering request failed' });
  }
  if (!process.stdout.write(reply + '\n')) await once(process.stdout, 'drain');
}
