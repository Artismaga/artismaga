import { parseResponse } from './validation.js';
import type { ApiResponse } from '../shared/contracts.js';
export async function postJson(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<ApiResponse> {
  if (!path.startsWith('/api/')) throw new Error('Invalid request path');
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  const value: unknown = await response.json();
  const data = parseResponse(value);
  if (!response.ok) throw new Error(data.error ?? 'Request failed. Please try again.');
  return data;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to connect. Please try again.';
}
