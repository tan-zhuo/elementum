import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Fills the site URL into index.html and emits robots.txt and sitemap.xml.
 *
 * The generated files are not committed to `public/` so the site URL lives in
 * exactly one place instead of being duplicated into static files that quietly go
 * stale when the deployment moves. The `%VITE_SITE_URL%` placeholders are filled
 * here rather than by Vite's own env substitution, which only fires when the
 * variable is actually defined in a `.env` — and that file is git-ignored.
 */
function seoFiles(siteUrl: string): Plugin {
  return {
    name: 'elementum-seo-files',
    transformIndexHtml(html) {
      return html.replaceAll('%VITE_SITE_URL%', siteUrl)
    },
    generateBundle() {
      const lastmod = new Date().toISOString().slice(0, 10)

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: ['User-agent: *', 'Allow: /', '', `Sitemap: ${siteUrl}sitemap.xml`, ''].join('\n'),
      })

      // A single-page app with no routes has exactly one indexable URL; listing
      // anything else would be inventing pages that do not exist.
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          '  <url>',
          `    <loc>${siteUrl}</loc>`,
          `    <lastmod>${lastmod}</lastmod>`,
          '    <changefreq>monthly</changefreq>',
          '    <priority>1.0</priority>',
          '  </url>',
          '</urlset>',
          '',
        ].join('\n'),
      })
    },
  }
}

/**
 * Where the site is served from, with a trailing slash. Override per deployment
 * with VITE_SITE_URL (see .env.example); everything else derives from it.
 */
const DEFAULT_SITE_URL = 'https://tan-zhuo.github.io/elementum/'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const siteUrl = env.VITE_SITE_URL || DEFAULT_SITE_URL

  return {
    plugins: [react(), tailwindcss(), seoFiles(siteUrl)],
    // Relative asset URLs so the built site works from any static host, including
    // GitHub Pages project sites served from a subpath.
    base: './',
  }
})
