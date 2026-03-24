import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const episodes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/episodes' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    podcast: z.string(), // "Hipsters Ponto Tech" | "IA Sob Controle" | etc.
    episodeNumber: z.number().optional(),
    sourceUrl: z.string().url(),
    authors: z.array(z.string()),
    tags: z.array(z.string()).default([]),
    segmentCount: z.number(),
    duration: z.string().optional(),
    quotes: z.array(z.object({
      text: z.string(),
      speaker: z.string(),
      timestamp: z.string().optional(),
    })).default([]),
  }),
});

const curtas = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/curtas' }),
  schema: z.object({
    quote: z.string(),
    speaker: z.string(),
    context: z.string(), // episode name or WhatsApp group
    sourceType: z.enum(['podcast', 'whatsapp']),
    sourceUrl: z.string().url().optional(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
  }),
});

const newsletters = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/newsletters' }),
  schema: z.object({
    title: z.string(),
    subject: z.string(),
    editionNumber: z.number(),
    pubDate: z.coerce.date(),
    status: z.string().default('generated'),
  }),
});

export const collections = { episodes, curtas, newsletters };
