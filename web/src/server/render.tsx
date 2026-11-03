import { renderToString } from 'react-dom/server';
import { Document } from '../components/Document.js';
import { pagePropsSchema } from '../shared/contracts.js';
/** Validate IPC input, escape all JSON/text through React, and render the hydrated document. */
export function render(input: unknown): string {
  const props = pagePropsSchema.parse(input);
  return '<!doctype html>' + renderToString(<Document props={props} />);
}
