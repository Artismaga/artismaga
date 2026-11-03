import { z } from 'zod';
export const translationPageSchema = z.object({
  work_revision: z.number().int(),
  source_locale: z.string(),
  can_manage: z.boolean(),
  grants: z.array(
    z.object({
      uid: z.string(),
      locale: z.string(),
      can_draft: z.boolean(),
      can_approve: z.boolean(),
      display_name: z.string(),
    }),
  ),
  scopes: z.array(
    z.object({
      uid: z.string(),
      title: z.string(),
      source_hash: z.string(),
      fields: z.record(z.string(), z.string()),
    }),
  ),
  translations: z.array(
    z.object({
      scope: z.string(),
      locale: z.string(),
      revision: z.number(),
      value: z.object({
        source_hash: z.string(),
        live_source_hash: z.string().nullable().optional(),
        draft: z.record(z.string(), z.string()).nullable().optional(),
        live: z.record(z.string(), z.string()).nullable().optional(),
        author: z.string(),
        approver: z.string().nullable().optional(),
      }),
    }),
  ),
});
export type TranslationPage = z.infer<typeof translationPageSchema>;
