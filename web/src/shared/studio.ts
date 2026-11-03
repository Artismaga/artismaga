import { analyticsSchema, lifecycleSchema } from './reader.js';
import { storedScheduleSchema } from './schedule.js';
import { writingPageSchema } from './writing.js';
import { translationPageSchema } from './translations.js';
import { z } from 'zod';
import { detailsSchema } from './creative.js';
export const assetSchema = z
  .object({
    uid: z.string(),
    url: z.string().startsWith('/media/'),
    palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)),
  })
  .strict();
export type AssetRef = z.infer<typeof assetSchema>;
export const artworkSchema = z
  .object({
    cover_url: z
      .string()
      .refine(
        (value) =>
          value.startsWith('/media/asset_') || value.startsWith('/assets/default-cover.svg'),
      ),
    hero_url: z.string().startsWith('/media/asset_').nullable(),
    palette: z.array(z.string()),
  })
  .strict();
export const workSchema = z
  .object({
    uid: z.string(),
    owner: z.string(),
    title: z.string(),
    subtitle: z.string(),
    synopsis: z.string(),
    work_type: z.literal('book'),
    status: z.string(),
    cover: z.string().nullable().optional().default(null),
    hero: z.string().nullable().optional().default(null),
    created_at: z.number(),
    updated_at: z.number(),
    revision: z.number(),
    accessed_at: z.number().default(0),
  })
  .strict();
export const studioSchema = z
  .object({
    publishing: z
      .object({
        language: z.string(),
        status: z.string(),
        mature: z.boolean(),
        related: z.array(z.string()),
        release_schedule: storedScheduleSchema,
      })
      .strict()
      .nullable()
      .default(null),
    lifecycle: lifecycleSchema.nullable().default(null),
    analytics: analyticsSchema.nullable().default(null),
    published_chapters: z.array(z.string()).default([]),
    publishing_options: z
      .array(z.object({ uid: z.string(), title: z.string(), author_name: z.string() }).strict())
      .default([]),
    editor: writingPageSchema.nullable().default(null),
    details: detailsSchema.nullable().default(null),
    translations: translationPageSchema.nullable().default(null),
    list: z
      .object({
        works: z.array(workSchema),
        has_more: z.boolean(),
        offset: z.number(),
        search: z.string(),
        filter: z.string(),
        sort: z.string(),
        can_create: z.boolean(),
      })
      .nullable(),
    work: z
      .object({
        work: workSchema,
        can_edit: z.boolean(),
        can_share: z.boolean(),
        shares: z.array(
          z.object({
            uid: z.string(),
            can_edit: z.boolean(),
            display_name: z.string().default(''),
          }),
        ),
      })
      .nullable(),
    artwork: z.record(z.string(), artworkSchema),
    default_artwork: artworkSchema,
  })
  .strict();
export type Work = z.infer<typeof workSchema>;
export type Artwork = z.infer<typeof artworkSchema>;
export const locationSchema = z
  .object({
    kind: z.enum(['local', 's3', 'r2']),
    bucket: z.string(),
    region: z.string(),
    account_id: z.string(),
  })
  .strict();
export const storageSettingsSchema = z
  .object({
    revision: z.number(),
    location: locationSchema,
    credentials_set: z.boolean(),
    retained_locations: z.array(
      z
        .object({ uid: z.string(), location: locationSchema, credentials_set: z.boolean() })
        .strict(),
    ),
  })
  .strict();
export type StorageSettings = z.infer<typeof storageSettingsSchema>;
export const roleSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    permissions: z.array(
      z.enum([
        'create_story',
        'publish_story',
        'comment',
        'review',
        'administer',
        'configure_localisation',
        'manage_announcements',
        'manage_comments',
        'view_analytics',
      ]),
    ),
    revision: z.number().default(0),
  })
  .strict();
export type Role = z.infer<typeof roleSchema>;
