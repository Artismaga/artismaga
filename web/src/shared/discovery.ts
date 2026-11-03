import { chapterStatsSchema } from './reader.js';
import { storedScheduleSchema } from './schedule.js';
import { z } from 'zod';
import { detailsSchema, genreSchema } from './creative.js';
export const discoveryGenreSchema = genreSchema.extend({
  image_palette: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).default([]),
});
export const storySchema = z
  .object({
    hiatus_until: z.number().int().nullable().default(null),
    chapter_dates: z
      .record(
        z.string(),
        z
          .object({
            body_revision: z.number().int().nullable().default(null),
            released_at: z.number().int(),
            updated_at: z.number().int(),
          })
          .strict(),
      )
      .default({}),
    related: z.array(z.string()).default([]),
    release_schedule: storedScheduleSchema,
    latest_chapter_release: z.number().int(),
    completed_at: z.number().int().nullable(),
    uid: z.string(),
    author: z.string(),
    author_name: z.string(),
    title: z.string(),
    subtitle: z.string(),
    synopsis: z.string(),
    cover: z.string().startsWith('asset_'),
    hero: z.string().startsWith('asset_'),
    details: detailsSchema.shape.value,
    language: z.enum(['en', 'ja', 'zh', 'es', 'fr']),
    status: z.enum(['ongoing', 'completed', 'hiatus', 'abandoned', 'discontinued']),
    mature: z.boolean(),
    featured: z.boolean(),
    first_published: z.number().int(),
    updated_at: z.number().int(),
  })
  .strict();
export const discoverySchema = z
  .object({
    scores: z.record(z.string(), z.number().nonnegative()).default({}),
    continue_reading: z
      .record(
        z.string(),
        z
          .object({
            work: z.string(),
            chapter: z.string(),
            position: z.number().min(0).max(1),
            updated_at: z.number().int(),
          })
          .strict(),
      )
      .default({}),
    chapter_stats: z.array(chapterStatsSchema).default([]),
    subgenre: z.string().default(''),
    catalogue_page: z.number().int().min(1).max(5).default(1),
    stories: z.array(storySchema),
    genres: z.array(discoveryGenreSchema),
    mature_content: z.enum(['hide', 'blur', 'show']),
  })
  .strict();
export type Story = z.infer<typeof storySchema>;
