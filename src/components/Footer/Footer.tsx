import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'

const BLOG_URL = 'https://tanzhuo.xyz'
const REPO_URL = 'https://github.com/tan-zhuo/elementum'

const LINK_CLASS =
  'inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-slate-400 transition-colors hover:border-cyan-400/40 hover:text-cyan-200'

export function Footer() {
  const locale = useAppStore((s) => s.locale)

  return (
    <footer className="mt-8 border-t border-white/8">
      <div className="mx-auto flex max-w-[100rem] flex-col items-center justify-between gap-3 px-3 py-5 text-xs text-slate-500 sm:flex-row sm:px-5">
        <p>
          {translate('appTitle', locale)} · {translate('appSubtitle', locale)}
        </p>

        <nav className="flex items-center gap-2">
          <a href={BLOG_URL} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 2.5h7l3 3v8h-10z" />
              <path d="M5.5 7h5M5.5 9.5h5M5.5 11.5h3" />
            </svg>
            {translate('blog', locale)}
            <span className="text-slate-600">tanzhuo.xyz</span>
          </a>

          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
            <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38l-.01-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.18-.89-1.18-.73-.5.05-.49.05-.49.81.06 1.23.83 1.23.83.72 1.23 1.89.88 2.35.67.07-.52.28-.88.51-1.08-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            {translate('sourceCode', locale)}
          </a>
        </nav>
      </div>
    </footer>
  )
}
