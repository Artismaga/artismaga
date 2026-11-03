import { z } from 'zod';
import { nodeSchema } from './creative.js';
import { richNodeSchema } from './writing.js';
export const reactionConfigurationSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    show_titles: z.boolean(),
    reactions: z
      .array(
        z
          .object({
            id: z.string(),
            title: z.string().min(1).max(40),
            image: z
              .string()
              .regex(/^\/(assets\/reactions\/[a-f0-9-]+\.png|media\/asset_[a-f0-9-]+)$/),
          })
          .strict(),
      )
      .max(6),
  })
  .strict();
export type ReactionConfiguration = z.infer<typeof reactionConfigurationSchema>;
export const chapterStatsSchema = z
  .object({
    chapter: z.string(),
    views: z.number().nonnegative(),
    completions: z.number().nonnegative(),
    ratings: z.number().nonnegative(),
    rating_sum: z.number().nonnegative(),
    reactions: z.record(z.string(), z.number().nonnegative()),
  })
  .strict();
export const emptyChapterStats = {
  chapter: '',
  views: 0,
  completions: 0,
  ratings: 0,
  rating_sum: 0,
  reactions: {},
};
export const lifecycleSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    status: z.enum(['ongoing', 'hiatus', 'abandoned', 'completed']),
    hiatus_until: z.number().int().nullable(),
  })
  .strict();
export const analyticsSchema = z
  .object({
    chapters: z.array(chapterStatsSchema),
    days: z.array(
      z.object({ day: z.number().int(), views: z.number(), completions: z.number() }).strict(),
    ),
  })
  .strict();
export const readerSchema = z
  .object({
    stats: chapterStatsSchema.default(emptyChapterStats),
    work: z.string(),
    story_title: z.string(),
    chapter: nodeSchema,
    chapters: z.array(nodeSchema),
    body: z
      .object({
        document: richNodeSchema,
        language: z.string(),
        revision: z.number().int(),
        released_at: z.number().int(),
        updated_at: z.number().int(),
      })
      .strict(),
  })
  .strict();
export const readingStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    position: z.number().min(0).max(1),
    reactions: z.array(z.string()).max(6),
    rating: z.number().int().min(0).max(5).nullable(),
    updated_at: z.number().int(),
  })
  .strict();
export type ReadingState = z.infer<typeof readingStateSchema>;
export const emptyReadingState: ReadingState = {
  revision: 0,
  position: 0,
  reactions: [],
  rating: null,
  updated_at: 0,
};
export const readerSettingsSchema = z
  .object({
    size: z.number().min(14).max(32),
    font: z.enum(['serif', 'sans-serif', 'monospace']),
    spacing: z.number().min(1.2).max(2.4),
    width: z.number().min(40).max(90),
    theme: z.enum(['light', 'dark']),
    speed: z.number().min(0.5).max(2),
  })
  .strict();
export type ReaderSettings = z.infer<typeof readerSettingsSchema>;
export const defaultReaderSettings: ReaderSettings = {
  size: 20,
  font: 'serif',
  spacing: 1.8,
  width: 70,
  theme: 'light',
  speed: 1,
};
