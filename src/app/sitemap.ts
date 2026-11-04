import type { MetadataRoute } from 'next';
import { publicPages, siteOrigin } from '@/lib/site-content';
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: siteOrigin, changeFrequency: 'weekly', priority: 1 }, ...publicPages.map(page => ({ url: `${siteOrigin}/${page.slug}`, changeFrequency: 'monthly' as const, priority: page.slug === 'pricing' ? 0.9 : 0.7 })), { url: `${siteOrigin}/privacy`, changeFrequency: 'monthly', priority: 0.4 }, { url: `${siteOrigin}/terms`, changeFrequency: 'monthly', priority: 0.4 }];
}
