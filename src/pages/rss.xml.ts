import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const episodes = await getCollection('episodes');

  return rss({
    title: 'Hipsters Builders',
    description: 'Os melhores momentos dos podcasts e comunidades da Hipsters Network',
    site: context.site!,
    items: episodes
      .sort((a, b) => new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime())
      .slice(0, 30)
      .map(ep => ({
        title: ep.data.title,
        pubDate: ep.data.pubDate,
        description: ep.data.description,
        link: `/episodios/${ep.id}`,
      })),
  });
}
