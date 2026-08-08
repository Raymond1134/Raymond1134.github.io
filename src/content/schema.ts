import { z } from 'zod'

const LinkSchema = z.object({
  label: z.string(),
  url: z.string(),
  icon: z.enum(['github', 'linkedin', 'instagram', 'devpost', 'mail', 'phone', 'external', 'doc', 'play']).optional(),
})

const MediaSchema = z.object({
  type: z.enum(['image', 'video']),
  src: z.string(),
  poster: z.string().optional(),
  alt: z.string(),
  caption: z.string().optional(),
})

const BeaconSchema = z.object({
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
    themeColorCold: z.string().default('#2d6fd8'),
    themeColorMid: z.string().default('#8a5ce6'),
    themeColorHot: z.string().default('#ef7ec7'),
    themeColorAccent: z.string().default('#fff2fa'),
  }),
  root: z.string(),
  beacons: z.array(BeaconSchema),
})

export type Media = z.infer<typeof MediaSchema>
export type Beacon = z.infer<typeof BeaconSchema>
export type Site = z.infer<typeof SiteSchema>
