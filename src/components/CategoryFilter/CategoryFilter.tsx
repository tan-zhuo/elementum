import type { HeatmapKey } from '../../types/element'
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_ORDER } from '../../data/categories'
import { HEATMAP_RAMP, buildHeatmapScale, formatValue } from '../../data/elements'
import { useAppStore } from '../../stores/useAppStore'
import { HEATMAP_LABELS, PROPERTY_UNITS, translate } from '../../i18n'
import { withAlpha } from '../../lib/color'

const HEATMAP_KEYS = Object.keys(HEATMAP_LABELS) as HeatmapKey[]

export function CategoryFilter() {
  const locale = useAppStore((s) => s.locale)
  const activeCategories = useAppStore((s) => s.activeCategories)
  const toggleCategory = useAppStore((s) => s.toggleCategory)
  const heatmap = useAppStore((s) => s.heatmap)
  const setHeatmap = useAppStore((s) => s.setHeatmap)
  const query = useAppStore((s) => s.query)
  const clearFilters = useAppStore((s) => s.clearFilters)

  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale)
  const anyFilter = activeCategories.length > 0 || query.trim().length > 0 || heatmap !== null
  const scale = heatmap ? buildHeatmapScale(heatmap) : null

  return (
    // Below `sm` both rows become horizontally scrollable strips. Wrapping instead
    // would push the sticky header to roughly a third of a phone screen.
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-x-visible sm:pb-0">
        {CATEGORY_ORDER.map((key) => {
          const color = CATEGORY_COLORS[key]
          const active = activeCategories.includes(key)
          // With no explicit selection every category reads as active.
          const emphasised = active || activeCategories.length === 0
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleCategory(key)}
              aria-pressed={active}
              style={{
                borderColor: withAlpha(color, active ? 0.85 : 0.28),
                backgroundColor: withAlpha(color, active ? 0.2 : 0.06),
                color: emphasised ? color : withAlpha(color, 0.45),
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: color, opacity: emphasised ? 1 : 0.4 }}
              />
              {CATEGORY_LABELS[key][locale]}
            </button>
          )
        })}

        {anyFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-1 shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/35 hover:text-slate-100"
          >
            {t('clearFilters')}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-x-visible sm:pb-0">
        <span className="shrink-0 text-[11px] text-slate-500">{t('colorMode')}</span>

        <button
          type="button"
          onClick={() => setHeatmap(null)}
          aria-pressed={heatmap === null}
          className={`shrink-0 rounded-md border px-2 py-1 text-[11px] transition-colors ${
            heatmap === null
              ? 'accent-active'
              : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-slate-200'
          }`}
        >
          {t('colorByCategory')}
        </button>

        {HEATMAP_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setHeatmap(heatmap === key ? null : key)}
            aria-pressed={heatmap === key}
            className={`shrink-0 rounded-md border px-2 py-1 text-[11px] transition-colors ${
              heatmap === key
                ? 'accent-active'
                : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-slate-200'
            }`}
          >
            {HEATMAP_LABELS[key][locale]}
          </button>
        ))}

        {scale && heatmap && (
          <div className="ml-1 flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] tabular-nums text-slate-500">
              {formatValue(scale.min, '', '—')}
            </span>
            <span
              aria-hidden
              className="h-2 w-24 rounded-full"
              style={{ background: `linear-gradient(90deg, ${HEATMAP_RAMP.join(', ')})` }}
            />
            <span className="text-[10px] tabular-nums text-slate-500">
              {formatValue(scale.max, PROPERTY_UNITS[heatmap], '—')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
