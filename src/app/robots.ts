import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site-content';
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/auth/', '/sessions/', '/account', '/billing', '/home', '/history', '/login', '/signup', '/onboarding', '/forgot-password', '/reset-password'] }, sitemap: `${siteOrigin}/sitemap.xml`, host: siteOrigin };
}
