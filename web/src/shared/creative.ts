import { z } from 'zod';
export const genreSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    parent: z.string().nullable(),
    colour: z.string(),
    icon: z.string(),
    image: z.string().nullable().optional().default(null),
    hero: z.string().nullable().optional().default(null),
  })
  .strict();
export type Genre = z.infer<typeof genreSchema>;
export const taxonomySchema = z
  .object({
    revision: z.number().int(),
    value: z
      .object({
        premade_genres: z.boolean(),
        allow_arbitrary_tags: z.boolean(),
        premade_tags: z.boolean(),
        genres: z.array(genreSchema),
        tags: z.array(z.string()),
      })
      .strict(),
  })
  .strict();
export type Taxonomy = z.infer<typeof taxonomySchema>;
export const nodeSchema = z
  .object({
    uid: z.string(),
    kind: z.enum(['volume', 'arc', 'chapter']),
    disclosures: z
      .array(z.enum(['gore', 'assault', 'sexual_content']))
      .max(3)
      .default([]),
    parent: z.string().nullable().optional().default(null),
    title: z.string(),
    synopsis: z.string(),
    cover: z.string().nullable().optional().default(null),
    delete_after: z.number().nullable().optional().default(null),
  })
  .strict();
export type ChapterNode = z.infer<typeof nodeSchema>;
export const disclosuresSchema = z
  .object({
    gore: z.string().nullable().optional().default(null),
    self_harm: z.string().nullable().optional().default(null),
    assault: z.string().nullable().optional().default(null),
    adult: z.string().nullable().optional().default(null),
  })
  .strict();
export const targetAudienceSchema = z
  .object({
    minimum_age: z.number().int().min(0).max(120).nullable(),
    maximum_age: z.number().int().min(0).max(120).nullable(),
  })
  .strict()
  .refine(
    (v) => v.minimum_age === null || v.maximum_age === null || v.minimum_age <= v.maximum_age,
  );
export const detailsSchema = z
  .object({
    revision: z.number().int(),
    value: z
      .object({
        nodes: z.array(nodeSchema).default([]),
        genres: z
          .array(
            z.object({
              genre: z.string(),
              subgenre: z.string().nullable().optional().default(null),
            }),
          )
          .default([]),
        tags: z.array(z.string()).default([]),
        target_audience: targetAudienceSchema.default({ minimum_age: null, maximum_age: null }),
        disclosures: disclosuresSchema.default({
          gore: null,
          self_harm: null,
          assault: null,
          adult: null,
        }),
      })
      .strict(),
  })
  .strict();
export type Details = z.infer<typeof detailsSchema>;
export const suggestionSchema = z.object({ value: z.string(), label: z.string() }).strict();
export type Suggestion = z.infer<typeof suggestionSchema>;

export type DetailsCommand =
  | { action: 'audience'; target_audience: Details['value']['target_audience'] }
  | {
      action: 'save_node';
      disclosures?: ChapterNode['disclosures'];
      uid: string | null;
      kind: ChapterNode['kind'];
      parent: string | null;
      title: string;
      synopsis: string;
      cover: string | null;
    }
  | { action: 'move'; uid: string; parent: string | null; before: string | null }
  | { action: 'archive' | 'restore' | 'remove_group'; uid: string }
  | ({ action: 'metadata' } & Pick<Details['value'], 'genres' | 'tags' | 'disclosures'>);
