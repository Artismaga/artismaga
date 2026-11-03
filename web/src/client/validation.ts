import type { ApiResponse, SignupMode } from '../shared/contracts.js';
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function parseResponse(value: unknown): ApiResponse {
  if (!isRecord(value)) throw new Error('Unexpected server response.');
  const result: ApiResponse = {};
  for (const key of ['message', 'error', 'invitation', 'redirect', 'status'] as const) {
    if (key in value) {
      const field: unknown = value[key];
      if (typeof field !== 'string') throw new Error('Unexpected server response.');
      result[key] = field;
    }
  }
  if ('revision' in value) {
    if (
      typeof value['revision'] !== 'number' ||
      !Number.isSafeInteger(value['revision']) ||
      value['revision'] < 0
    )
      throw new Error('Unexpected server response.');
    result.revision = value['revision'];
  }
  return result;
}
export function parseSignupMode(value: string): SignupMode {
  switch (value) {
    case 'open':
    case 'invitation':
    case 'disabled':
      return value;
    default:
      throw new Error('Choose a valid registration policy.');
  }
}
