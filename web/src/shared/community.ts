import { z } from 'zod';
export const commentSchema = z
  .object({
    uid: z.string(),
    account: z.string(),
    parent: z.string().nullable(),
    body: z.string().max(16000),
    gif: z
      .string()
      .regex(/^gif_[a-f0-9]{64}$/)
      .nullable(),
    created_at: z.number().int(),
    revision: z.number().int(),
    deleted: z.boolean(),
    likes: z.number().int().nonnegative(),
    liked: z.boolean(),
    name: z.string(),
    avatar: z.string(),
    manager: z.boolean(),
    author: z.boolean(),
  })
  .strict();
export const discussionSchema = z
  .object({
    comments: z.array(commentSchema).max(500),
    account: z.string().nullable(),
    can_comment: z.boolean(),
    can_manage: z.boolean(),
    muted: z.array(z.string()),
  })
  .strict();
export type Comment = z.infer<typeof commentSchema>;
export const inboxSchema = z
  .object({
    account: z.string(),
    notifications: z
      .array(
        z
          .object({
            uid: z.string(),
            work: z.string(),
            chapter: z.string(),
            comment: z.string(),
            kind: z.enum(['comment', 'reply']),
            created_at: z.number().int(),
            read: z.boolean(),
            title: z.string(),
            thumbnail: z.string().regex(/^\/media\/asset_[a-f0-9-]+$/),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
