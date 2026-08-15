import { useCallback, useMemo, useState } from 'react'
import type { CategoryKey } from '../../types/element'
import { CATEGORY_COLORS } from '../../data/categories'
import {
  ELEMENTS,
  buildHeatmapScale,
  getElement,
  heatmapColor,
  searchElements,
} from '../../data/elements'
import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'
import { withAlpha } from '../../lib/color'
import { ElementCell } from '../ElementCell/ElementCell'
import { ElementTooltip } from './ElementTooltip'

/** Grid rows 9 and 10 hold the f-block; these markers sit in the gaps it leaves. */
const F_BLOCK_MARKERS = [
  { row: 6, label: '57-71', category: 'lanthanide' as CategoryKey },
  { row: 7, label: '89-103', category: 'actinide' as CategoryKey },
]

const GROUPS = Array.from({ length: 18 }, (_, i) => i + 1)
const PERIODS = Array.from({ length: 7 }, (_, i) => i + 1)

interface HoverState {
  number: number
  rect: DOMRect
}

export function PeriodicTable() {
  const locale = useAppStore((s) => s.locale)
  const query = useAppStore((s) => s.query)
  const activeCategories = useAppStore((s) => s.activeCategories)
  const heatmap = useAppStore((s) => s.heatmap)
  const selected = useAppStore((s) => s.selected)
  const compare = useAppStore((s) => s.compare)
  const select = useAppStore((s) => s.select)

  const [hover, setHover] = useState<HoverState | null>(null)

  /** Atomic numbers passing the search + category filters. */
  const visible = useMemo(() => {
    const matches = new Set(searchElements(query))
    if (activeCategories.length === 0) return matches
    const categories = new Set(activeCategories)
    return new Set([...matches].filter((n) => categories.has(getElement(n)!.category)))
  }, [query, activeCategories])

  const scale = useMemo(() => (heatmap ? buildHeatmapScale(heatmap) : null), [heatmap])

  const heatColorFor = useCallback(
    (number: number): string | null => {
      if (!heatmap || !scale) return null
      const t = scale.normalize(getElement(number)![heatmap])
      // No measured value for this property: flat grey, not a ramp colour that
      // would read as real data.
      return t === null ? 'rgb(51, 60, 76)' : heatmapColor(t)
    },
    [heatmap, scale],
  )

  const onHover = useCallback((number: number | null, rect: DOMRect | null) => {
    setHover(number !== null && rect ? { number, rect } : null)
  }, [])

  const hoveredElement = hover ? getElement(hover.number) : undefined
  const filtersActive = query.trim().length > 0 || activeCategories.length > 0
  const noResults = filtersActive && visible.size === 0

  return (
    <div className="w-full overflow-x-auto pb-2">
      {noResults && (
        <p className="px-2 py-6 text-center text-sm text-slate-500">
          {translate('searchNoResults', locale)}
        </p>
      )}

      <div
        role="grid"
        aria-label={translate('appTitle', locale)}
        className="grid min-w-[54rem] gap-[3px] px-1"
        style={{
          // Column 1 and row 1 carry the group/period labels; the element grid is
          // offset by one in both axes.
          gridTemplateColumns: '1.25rem repeat(18, minmax(0, 1fr))',
          gridTemplateRows: '0.9rem repeat(7, minmax(0, 1fr)) 0.5rem repeat(2, minmax(0, 1fr))',
        }}
      >
        {GROUPS.map((group) => (
          <div
            key={`g${group}`}
            aria-hidden
            className="flex items-end justify-center text-[9px] tabular-nums text-slate-600"
            style={{ gridColumn: group + 1, gridRow: 1 }}
          >
            {group}
          </div>
        ))}

        {PERIODS.map((period) => (
          <div
            key={`p${period}`}
            aria-hidden
            className="flex items-center justify-center text-[9px] tabular-nums text-slate-600"
            style={{ gridColumn: 1, gridRow: period + 1 }}
          >
            {period}
          </div>
        ))}

        {F_BLOCK_MARKERS.map(({ row, label, category }) => (
          <div
            key={label}
            aria-hidden
            className="flex aspect-square items-center justify-center rounded-[5px] border border-dashed text-[8px] tabular-nums lg:text-[9px]"
            style={{
              gridColumn: 4,
              gridRow: row + 1,
              borderColor: withAlpha(CATEGORY_COLORS[category], 0.35),
              color: withAlpha(CATEGORY_COLORS[category], 0.75),
            }}
          >
            {label}
          </div>
        ))}

        {ELEMENTS.map((element) => (
          <ElementCell
            key={element.number}
            element={element}
            locale={locale}
            dimmed={filtersActive && !visible.has(element.number)}
            selected={selected === element.number}
            comparing={compare.includes(element.number)}
            heatColor={heatColorFor(element.number)}
            onSelect={select}
            onHover={onHover}
          />
        ))}
      </div>

      {hoveredElement && hover && (
        <ElementTooltip element={hoveredElement} anchor={hover.rect} locale={locale} />
      )}
    </div>
  )
}
