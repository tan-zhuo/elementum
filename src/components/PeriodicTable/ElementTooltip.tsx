import { useLayoutEffect, useRef, useState } from 'react'
import type { Element, Locale } from '../../types/element'
import { CATEGORY_COLORS } from '../../data/categories'
import { categoryName, formatValue } from '../../data/elements'
import { PROPERTY_UNITS, translate } from '../../i18n'
import { withAlpha } from '../../lib/color'

interface ElementTooltipProps {
  element: Element
  /** Viewport rect of the hovered cell. */
  anchor: DOMRect
  locale: Locale
}

const MARGIN = 8

export function ElementTooltip({ element, anchor, locale }: ElementTooltipProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const color = CATEGORY_COLORS[element.category]

  // Measure after paint, then place: above the cell by default, flipped below when
  // it would overflow the top, and clamped to stay on screen horizontally.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const { width, height } = node.getBoundingClientRect()

    let top = anchor.top - height - MARGIN
    if (top < MARGIN) top = anchor.bottom + MARGIN
    if (top + height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, window.innerHeight - height - MARGIN)
    }

    const left = Math.min(
      Math.max(MARGIN, anchor.left + anchor.width / 2 - width / 2),
      window.innerWidth - width - MARGIN,
    )

    setPos({ left, top })
  }, [anchor])

  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale)

  return (
    <div
      ref={ref}
      role="tooltip"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        borderColor: withAlpha(color, 0.45),
        // Hidden until measured so it never flashes in the top-left corner.
        visibility: pos ? 'visible' : 'hidden',
      }}
      className="surface-raised-veil pointer-events-none fixed z-40 w-56 rounded-lg border p-3 shadow-2xl backdrop-blur-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xl font-semibold" style={{ color }}>
          {element.symbol}
        </span>
        <span className="text-xs tabular-nums text-slate-500">#{element.number}</span>
      </div>

      <div className="mt-0.5 text-sm text-slate-200">
        {locale === 'zh' ? element.nameZh : element.name}
        <span className="ml-1.5 text-xs text-slate-500">
          {locale === 'zh' ? element.name : element.nameZh}
        </span>
      </div>

      <div className="mt-1.5 text-[11px] font-medium" style={{ color }}>
        {categoryName(element, locale)}
      </div>

      <dl className="mt-2 space-y-1 border-t border-white/5 pt-2 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">{t('atomicMass')}</dt>
          <dd className="tabular-nums text-slate-300">
            {formatValue(element.atomicMass, PROPERTY_UNITS.atomicMass, t('noData'))}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-slate-500">{t('phase')}</dt>
          <dd className="text-slate-300">{element.phase}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="shrink-0 text-slate-500">{t('shellDistribution')}</dt>
          <dd className="truncate tabular-nums text-slate-300">{element.shells.join('-')}</dd>
        </div>
      </dl>
    </div>
  )
}
