import { useEffect, useRef, useState } from 'react'
import { THEMES, themeName, themeSwatch } from '../../data/themes'
import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'

/**
 * Accent theme picker.
 *
 * The palettes live in CSS; this only flips `data-theme` (through the store) and
 * previews each option with its own swatch, so the list reads as colours rather
 * than as names.
 */
export function ThemePicker() {
  const locale = useAppStore((s) => s.locale)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  // Click-away and Escape, the two ways every popover is expected to close.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, { capture: true })
    }
  }, [open])

  return (
    <div ref={container} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${translate('theme', locale)}: ${themeName(theme, locale)}`}
        title={`${translate('theme', locale)}: ${themeName(theme, locale)}`}
        className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] transition-colors hover:border-white/30"
      >
        <span
          aria-hidden
          className="h-3.5 w-3.5 rounded-full ring-1 ring-white/25"
          style={{
            backgroundColor: themeSwatch(theme),
            boxShadow: `0 0 8px ${themeSwatch(theme)}`,
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={translate('theme', locale)}
          className="surface-raised-veil absolute right-0 top-full z-40 mt-1.5 w-44 overflow-hidden rounded-xl border border-white/10 p-1 shadow-2xl backdrop-blur"
        >
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {translate('theme', locale)}
          </p>
          {THEMES.map((option) => {
            const active = option.key === theme
            return (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setTheme(option.key)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                  active ? 'bg-white/[0.07] text-slate-100' : 'text-slate-400 hover:bg-white/[0.04]'
                }`}
              >
                <span
                  aria-hidden
                  className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/20"
                  style={{
                    backgroundColor: option.swatch,
                    boxShadow: active ? `0 0 8px ${option.swatch}` : undefined,
                  }}
                />
                <span className="flex-1 truncate">{locale === 'zh' ? option.zh : option.en}</span>
                {active && (
                  <span aria-hidden className="accent-text text-[11px]">
                    ✓
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
