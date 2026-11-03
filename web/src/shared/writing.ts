import { z } from 'zod';
import { nodeSchema } from './creative.js';
export interface RichNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichNode[];
}
export const richNodeSchema: z.ZodType<RichNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        'doc',
        'paragraph',
        'heading',
        'blockquote',
        'bulletList',
        'orderedList',
        'listItem',
        'horizontalRule',
        'hardBreak',
        'text',
      ]),
      text: z.string().optional(),
      attrs: z.record(z.string(), z.unknown()).optional(),
      marks: z
        .array(
          z
            .object({
              type: z.enum(['bold', 'italic', 'link']),
              attrs: z.record(z.string(), z.unknown()).optional(),
            })
            .strict(),
        )
        .optional(),
      content: z.array(richNodeSchema).optional(),
    })
    .strict()
    .transform((n) => ({
      type: n.type,
      ...(n.text !== undefined ? { text: n.text } : {}),
      ...(n.attrs ? { attrs: n.attrs } : {}),
      ...(n.marks
        ? { marks: n.marks.map((m) => ({ type: m.type, ...(m.attrs ? { attrs: m.attrs } : {}) })) }
        : {}),
      ...(n.content ? { content: n.content } : {}),
    })),
);
export const anchorSchema = z
  .object({
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
    quote: z.string().max(500),
    detached: z.boolean(),
  })
  .strict();
export const noteSchema = z
  .object({ uid: z.uuid(), text: z.string().max(4000), anchor: anchorSchema.nullable() })
  .strict();
export const manuscriptSchema = z
  .object({
    chapter_note: z.string().default(''),
    document: richNodeSchema,
    notes: z.array(noteSchema).max(100),
    language: z.enum(['en', 'ja', 'zh', 'es', 'fr']),
  })
  .strict()
  .transform((v) => ({
    ...v,
    chapter_note: [v.chapter_note, ...v.notes.filter((n) => !n.anchor).map((n) => n.text)]
      .filter(Boolean)
      .join('\n\n'),
    notes: v.notes.filter((n) => n.anchor),
  }));
export type Manuscript = z.infer<typeof manuscriptSchema>;
export type AuthorNote = z.infer<typeof noteSchema>;
export const draftSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    value: manuscriptSchema,
    updated_at: z.number(),
    author_name: z.string(),
  })
  .strict();
export type Draft = z.infer<typeof draftSchema>;
export const revisionSchema = z
  .object({
    revision: z.number().int().positive(),
    updated_at: z.number(),
    author_name: z.string(),
    reason: z.string(),
    avatar_url: z.string().nullable().default(null),
  })
  .strict();
export const historySchema = z
  .object({
    revisions: z.array(revisionSchema),
    has_more: z.boolean(),
    next_before: z.number().int(),
  })
  .strict();
export type History = z.infer<typeof historySchema>;
export const writingPageSchema = z
  .object({ chapter: nodeSchema, draft: draftSchema, can_edit: z.boolean() })
  .strict();
export function safeLink(href: string): boolean {
  if (!href || href.length > 2000 || /[\p{Cc}\\]/u.test(href)) return false;
  if (href.startsWith('#') || (href.startsWith('/') && !href.startsWith('//'))) return true;
  try {
    const u = new URL(href);
    return ['http:', 'https:'].includes(u.protocol) && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}
