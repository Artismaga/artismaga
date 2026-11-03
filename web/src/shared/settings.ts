import { z } from 'zod';
export const readingSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'sepia', 'system']),
    font_family: z.enum(['serif', 'sans', 'dyslexic']),
    font_size: z.number(),
    line_height: z.number(),
    content_width: z.number(),
    speech_speed: z.number(),
    offline_enabled: z.boolean(),
  })
  .strict();
export const accessibilitySchema = z
  .object({
    reduced_motion: z.boolean(),
    high_contrast: z.boolean(),
    large_controls: z.boolean(),
    screen_reader_announcements: z.boolean(),
    keyboard_navigation: z.boolean(),
  })
  .strict();
export const preferencesSchema = z
  .object({
    reading: readingSchema,
    accessibility: accessibilitySchema,
    content: z
      .object({
        automatic_translations: z.boolean().default(true),
        language: z.string(),
        timezone: z.string(),
        mature_content: z.enum(['hide', 'blur', 'show']),
        show_warnings: z.boolean(),
        hidden_genres: z.array(z.string()),
        hidden_tags: z.array(z.string()),
        hidden_authors: z.array(z.string()),
        hidden_stories: z.array(z.string()),
      })
      .strict(),
    notifications: z
      .object({
        in_app: z.boolean(),
        email: z.boolean(),
        frequency: z.enum(['immediate', 'daily', 'weekly', 'disabled']),
        new_chapters: z.boolean(),
        chapter_edits: z.boolean(),
        new_stories: z.boolean(),
        author_updates: z.boolean(),
        hiatus_returns: z.boolean(),
        replies: z.boolean(),
        mentions: z.boolean(),
        reviews: z.boolean(),
        reactions: z.boolean(),
      })
      .strict(),
    privacy: z
      .object({
        public_profile: z.boolean(),
        public_activity: z.boolean(),
        private_library: z.boolean(),
        private_history: z.boolean(),
        list_visibility: z.enum(['private', 'public']),
        review_visibility: z.enum(['private', 'public']),
      })
      .strict(),
  })
  .strict();
export const profileSchema = z
  .object({
    pen_name: z.string(),
    biography: z.string(),
    website: z.string(),
    links: z.array(z.object({ label: z.string(), url: z.string() }).strict()),
  })
  .strict();
export const themeOptionsSchema = z
  .object({ enabled: z.boolean(), primary_colour: z.string().regex(/^#[0-9a-f]{6}$/i) })
  .strict();
export const themesSchema = z
  .object({ light: themeOptionsSchema, dark: themeOptionsSchema, sepia: themeOptionsSchema })
  .strict();
export const siteConfigurationSchema = z
  .object({
    themes: themesSchema.default({
      light: { enabled: true, primary_colour: '#24675a' },
      dark: { enabled: true, primary_colour: '#24675a' },
      sepia: { enabled: true, primary_colour: '#24675a' },
    }),
    socials: z.record(z.string(), z.string()).default({}),
    site_name: z.string(),
    tagline: z.string(),
    description: z.string(),
    announcement: z.string(),
    support_url: z.string(),
    default_language: z.string(),
    timezone: z.string(),
    signup_mode: z.enum(['open', 'invitation', 'disabled']),
    default_group: z.string(),
    auto_abandon_after_months: z.number().int().min(1).max(120).nullable().default(null),
    primary_colour: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default('#24675a'),
    default_cover: z.string().nullable().default(null),
  })
  .strict();
export const configurationUpdateSchema = z
  .object({ revision: z.number().int().nonnegative(), configuration: siteConfigurationSchema })
  .strict();
export const sessionSchema = z
  .object({
    sid: z.string().nullable(),
    created_at: z.number().nullable(),
    expires_at: z.number(),
    device: z.string(),
    current: z.boolean(),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type SiteConfiguration = z.infer<typeof siteConfigurationSchema>;
export type ConfigurationUpdate = z.infer<typeof configurationUpdateSchema>;
export const languages = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
];
