import { z } from 'zod';
import { publicUserSchema } from './contracts.js';
export const announcementValueSchema = z
  .object({
    kind: z.enum(['notice', 'promotion']),
    severity: z.enum(['info', 'warning', 'critical']),
    title: z.string(),
    description: z.string(),
    image: z.string().nullable(),
    cta_text: z.string(),
    cta_url: z.string(),
    dismissible: z.boolean(),
    starts_at: z.number().nullable(),
    ends_at: z.number().nullable(),
    audience: z.enum([
      'everyone',
      'guests',
      'authenticated',
      'subscribers',
      'non_subscribers',
      'roles',
    ]),
    roles: z.array(z.string()),
  })
  .strict();
export const announcementSchema = z.object({
  uid: z.string(),
  revision: z.number(),
  value: announcementValueSchema,
  creator: z.string(),
  created_at: z.number(),
  cancelled: z.boolean(),
  initiator: publicUserSchema.nullable().optional(),
});
export type Announcement = z.infer<typeof announcementSchema>;
export type AnnouncementValue = z.infer<typeof announcementValueSchema>;
