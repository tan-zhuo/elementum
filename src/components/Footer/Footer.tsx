import { ELEMENTS } from '../../data/elements'
import { MOLECULES } from '../../data/molecules'
import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'

const BLOG_URL = 'https://tanzhuo.xyz'
const REPO_URL = 'https://github.com/tan-zhuo/elementum'

/** Data provenance, matching what the build scripts actually consume. */
const SOURCES: { key: 'footerElementData' | 'footerGeometryData' | 'footerRadiiData' | 'footerSummaryData'; label: string; href: string }[] = [
  {
    key: 'footerElementData',
    label: 'Periodic-Table-JSON',
    href: 'https://github.com/Bowserinator/Periodic-Table-JSON',
  },
  {
    key: 'footerGeometryData',
    label: 'NIST CCCBDB',
    href: 'https://cccbdb.nist.gov/',
  },
  {
    key: 'footerRadiiData',
    label: 'Cordero 2008 · Bondi',
    href: 'https://doi.org/10.1039/b801115j',
  },
  {
    key: 'footerSummaryData',
    label: 'Wikipedia',
    href: 'https://en.wikipedia.org/wiki/Periodic_table',
  },
]

const STACK = [
  { label: 'React 19', href: 'https://react.dev' },
  { label: 'three.js', href: 'https://threejs.org' },
  { label: 'Tailwind CSS', href: 'https://tailwindcss.com' },
  { label: 'Vite', href: 'https://vite.dev' },
]

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
      {children}
    </h2>
  )
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 text-slate-400 transition-colors hover:text-slate-100"
    >
      {children}
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-60"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M4.5 2.5h5v5M9.5 2.5 3 9" />
      </svg>
    </a>
  )
}

export function Footer() {
  const locale = useAppStore((s) => s.locale)
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const toggleMoleculeCategory = useAppStore((s) => s.toggleMoleculeCategory)
  const activeMoleculeCategories = useAppStore((s) => s.activeMoleculeCategories)
  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale)

  /** Footer nav doubles as real navigation rather than decorative links. */
  const goToMolecules = (category?: 'aminoacid') => {
    setView('molecules')
    if (category && !activeMoleculeCategories.includes(category)) toggleMoleculeCategory(category)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <footer className="surface-deep-veil mt-12 border-t border-white/8">
      <div className="mx-auto max-w-[100rem] px-4 py-10 sm:px-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1.2fr]">
          {/* Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="accent-border accent-bg relative flex h-8 w-8 items-center justify-center rounded-lg border"
              >
                <span className="accent-dot h-2 w-2 rounded-full" />
                <span className="accent-border absolute inset-1.5 rotate-45 rounded-sm border" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold text-slate-100">{t('appTitle')}</p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Elementum</p>
              </div>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-500">
              {t('footerTagline')}
            </p>
            <p className="mt-3 font-mono text-[11px] text-slate-600">
              {ELEMENTS.length} {t('elementCount')} · {MOLECULES.length} {t('moleculeCount')}
            </p>
          </div>

          {/* Sections */}
          <nav aria-label={t('footerSections')}>
            <Heading>{t('footerSections')}</Heading>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setView('elements')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className={`transition-colors hover:text-slate-100 ${
                    view === 'elements' ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {t('viewElements')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => goToMolecules()}
                  className={`transition-colors hover:text-slate-100 ${
                    view === 'molecules' ? 'text-slate-300' : 'text-slate-400'
                  }`}
                >
                  {t('moleculeTitle')}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => goToMolecules('aminoacid')}
                  className="text-slate-400 transition-colors hover:text-slate-100"
                >
                  {locale === 'zh' ? '氨基酸与肽' : 'Amino acids & peptides'}
                </button>
              </li>
            </ul>
          </nav>

          {/* Project */}
          <nav aria-label={t('footerProject')}>
            <Heading>{t('footerProject')}</Heading>
            <ul className="space-y-2 text-xs">
              <li className="group">
                <ExternalLink href={REPO_URL}>{t('sourceCode')}</ExternalLink>
              </li>
              <li className="group">
                <ExternalLink href={`${REPO_URL}#readme`}>{t('footerReadme')}</ExternalLink>
              </li>
              <li className="group">
                <ExternalLink href={`${REPO_URL}/issues`}>{t('footerIssues')}</ExternalLink>
              </li>
              <li className="group">
                <ExternalLink href={BLOG_URL}>{t('blog')}</ExternalLink>
              </li>
            </ul>
          </nav>

          {/* Data provenance */}
          <div>
            <Heading>{t('footerData')}</Heading>
            <ul className="space-y-2 text-xs">
              {SOURCES.map((source) => (
                <li key={source.key} className="group flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-slate-500">{t(source.key)}</span>
                  <ExternalLink href={source.href}>{source.label}</ExternalLink>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-9 flex flex-col gap-3 border-t border-white/5 pt-5 text-[11px] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>© {new Date().getFullYear()} tan-zhuo</span>
            <span aria-hidden className="text-slate-700">
              ·
            </span>
            <span>{t('footerNoBackend')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-slate-600">{t('footerBuiltWith')}</span>
            {STACK.map((item, i) => (
              <span key={item.label} className="flex items-center gap-2">
                {i > 0 && (
                  <span aria-hidden className="text-slate-700">
                    ·
                  </span>
                )}
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="transition-colors hover:text-slate-300"
                >
                  {item.label}
                </a>
              </span>
            ))}
          </div>
        </div>

        <p className="mt-3 text-[11px] text-slate-600">{t('footerDisclaimer')}</p>
      </div>
    </footer>
  )
}
