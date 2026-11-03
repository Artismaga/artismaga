import { z } from 'zod';
import { readerSchema, reactionConfigurationSchema } from './reader.js';
import { discoverySchema } from './discovery.js';
import { taxonomySchema } from './creative.js';
import { roleSchema, storageSettingsSchema, studioSchema } from './studio.js';
import {
  profileSchema,
  preferencesSchema,
  readingSchema,
  accessibilitySchema,
  siteConfigurationSchema,
  configurationUpdateSchema,
} from './settings.js';

export const signupModeSchema = z.enum(['open', 'invitation', 'disabled']);
export const publicUserSchema = z
  .object({
    uid: z.string(),
    display_name: z.string(),
    group_key: z.string(),
    email_verified: z.boolean(),
    avatar_url: z.url().startsWith('https://www.gravatar.com/avatar/'),
  })
  .strict();
export const ownAccountSchema = z
  .object({
    user: publicUserSchema,
    email: z.string(),
    profile: profileSchema,
    profile_revision: z.number(),
    preferences: preferencesSchema,
    preferences_revision: z.number(),
  })
  .strict();
export type OwnAccount = z.infer<typeof ownAccountSchema>;
export const pagePropsSchema = z
  .object({
    page: z.enum([
      'home',
      'genre',
      'story',
      'reader',
      'login',
      'register',
      'profile',
      'settings',
      'verify',
      'reset',
      'email',
      'admin',
      'analytics',
      'setup',
      'studio',
      'new_work',
      'work',
      'chapter',
    ]),
    localisation: z
      .object({
        locale: z.string(),
        timezone: z.string().default('UTC'),
        now: z
          .number()
          .int()
          .default(() => Math.floor(Date.now() / 1000)),
        source_locale: z.string(),
        enabled: z.array(z.string()),
        messages: z.record(z.string(), z.string()),
        preview: z.boolean(),
      })
      .default(() => ({
        timezone: 'UTC',
        now: Math.floor(Date.now() / 1000),
        locale: 'en',
        source_locale: 'en',
        enabled: ['en', 'ja', 'zh', 'es', 'fr'],
        messages: {},
        preview: false,
      })),
    announcement_roles: z.array(z.object({ key: z.string(), name: z.string() })).default([]),
    reader: readerSchema.nullable().default(null),
    reactions: reactionConfigurationSchema.nullable().default(null),
    discovery: discoverySchema.nullable().default(null),
    operational: z.unknown().optional(),
    announcements: z.array(z.unknown()).default([]),
    localisation_editor: z.unknown().optional(),
    siteName: z.string().min(1).max(100),
    signupMode: signupModeSchema,
    user: publicUserSchema.nullable(),
    mailEnabled: z.boolean(),
    section: z.string().default(''),
    permissions: z
      .array(
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
      )
      .default([]),
    styleNonce: z.string().default('render-worker-internal-styles'),
    site: siteConfigurationSchema.nullable().default(null),
    account: ownAccountSchema.nullable().default(null),
    appearance: z
      .object({ reading: readingSchema, accessibility: accessibilitySchema })
      .nullable()
      .default(null),
    studio: studioSchema.nullable().default(null),
    administrator: z
      .object({
        settings: configurationUpdateSchema,
        users: z.array(publicUserSchema),
        mail_enabled: z.boolean(),
        analytics_status: z.literal('not_connected'),
        roles: z.array(roleSchema).default([]),
        taxonomy: taxonomySchema.nullable().default(null),
        storage: storageSettingsSchema.nullable().default(null),
      })
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((props, context) => {
    if (
      !props.user &&
      props.discovery &&
      Object.keys(props.discovery.continue_reading).length > 0
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Reading progress requires an authenticated viewer',
      });
    }
    if (
      props.page === 'reader' &&
      (props.user ||
        props.account ||
        props.administrator ||
        props.studio ||
        props.permissions.length > 0 ||
        props.localisation.preview)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Downloadable readers require public anonymous props',
      });
    }
    if (props.reader && props.page !== 'reader')
      context.addIssue({ code: 'custom', message: 'Reader bodies require a reader page' });
    if (
      props.account &&
      (!['profile', 'settings'].includes(props.page) ||
        !props.user ||
        props.account.user.uid !== props.user.uid)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Own-account data requires the owner settings page',
      });
    }
    if (
      props.studio &&
      (!['studio', 'new_work', 'work', 'chapter'].includes(props.page) || !props.user)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Studio data requires an authenticated Studio page',
      });
    }
    if (
      props.localisation_editor &&
      (props.page !== 'admin' ||
        !props.user ||
        !props.permissions.includes('configure_localisation'))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Localisation drafts require editor permission',
      });
    }
    if (
      props.operational &&
      (!props.permissions.includes('view_analytics') ||
        !['admin', 'analytics'].includes(props.page))
    ) {
      context.addIssue({ code: 'custom', message: 'Analytics data requires analytics permission' });
    }
    if (props.administrator && (props.page !== 'admin' || !props.user)) {
      context.addIssue({
        code: 'custom',
        message: 'Administrator data requires an authenticated dashboard',
      });
    }
  });
export type PageProps = z.infer<typeof pagePropsSchema>;
export type SignupMode = z.infer<typeof signupModeSchema>;

export const apiResponseSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
  invitation: z.string().optional(),
  redirect: z.string().optional(),
  status: z.string().optional(),
  revision: z.number().int().nonnegative().optional(),
});
export type ApiResponse = z.infer<typeof apiResponseSchema>;
export interface MailSettings {
  host: string;
  username: string;
  password: string;
  from: string;
}
export interface SetupRequest {
  setup_code: string;
  site_name: string;
  public_url: string;
  signup_mode: SignupMode;
  admin_email: string;
  admin_name: string;
  admin_password: string;
  mail: MailSettings | null;
}
