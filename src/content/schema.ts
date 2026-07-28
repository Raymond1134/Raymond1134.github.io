import { z } from 'zod'

export const LinkSchema = z.object({
  label: z.string(),
  url: z.string(),
  icon: z.enum(['github', 'linkedin', 'mail', 'external', 'doc', 'play']).optional(),
})

export const MediaSchema = z.object({
  type: z.enum(['image', 'video']),
  src: z.string(),
  poster: z.string().optional(),
  alt: z.string(),
  caption: z.string().optional(),
})

export const BeaconSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'ids must be kebab-case: they become URLs'),
  title: z.string(),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  links: z.array(LinkSchema).default([]),
  media: z.array(MediaSchema).default([]),
  tags: z.array(z.string()).default([]),
  children: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  position: z.tuple([z.number(), z.number(), z.number()]).optional(),

  /* Multiplies the auto-layout distance from parent. */
  spread: z.number().default(1),

  hidden: z.boolean().default(false),
})

export const SiteSchema = z.object({
  meta: z.object({
    name: z.string(),
    role: z.string(),
    description: z.string(),
    url: z.string(),
    ogImage: z.string().optional(),
    themeColorCold: z.string().default('#3a7bd5'),
    themeColorHot: z.string().default('#d6b8ff'),
  }),
  audio: z.object({
    ambient: z.string().optional(),
    travel: z.string().optional(),
    hover: z.string().optional(),
    enabledByDefault: z.boolean().default(false),
  }).default({ enabledByDefault: false }),
  root: z.string(),
  beacons: z.array(BeaconSchema),
})

export type Link = z.infer<typeof LinkSchema>
export type Media = z.infer<typeof MediaSchema>
export type Beacon = z.infer<typeof BeaconSchema>
export type Site = z.infer<typeof SiteSchema>
