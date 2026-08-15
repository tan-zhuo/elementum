import { useState } from 'react'
import type { Element, HeatmapKey } from '../../types/element'
import { CATEGORY_COLORS } from '../../data/categories'
import { categoryName, elementName, formatValue, getElement } from '../../data/elements'
import { useAppStore } from '../../stores/useAppStore'
import { HEATMAP_LABELS, PROPERTY_UNITS, translate } from '../../i18n'
import { withAlpha } from '../../lib/color'

/** Rows of the comparison table, in display order. */
const ROWS: HeatmapKey[] = [
  'atomicMass',
  'atomicRadius',
  'electronegativity',
  'ionizationEnergy',
  'electronAffinity',
  'melt',
  'boil',
  'density',
]

export function ComparePanel() {
  const locale = useAppStore((s) => s.locale)
  const compare = useAppStore((s) => s.compare)
  const toggleCompare = useAppStore((s) => s.toggleCompare)
  const clearCompare = useAppStore((s) => s.clearCompare)
  const select = useAppStore((s) => s.select)
  const [collapsed, setCollapsed] = useState(false)

  if (compare.length === 0) return null

  const t = (key: Parameters<typeof translate>[0]) => translate(key, locale)
  const elements = compare
    .map((n) => getElement(n))
    .filter((el): el is Element => el !== undefined)

  return (
    <aside
      aria-label={t('compareTitle')}
      className="surface-raised-veil fixed bottom-3 left-1/2 z-30 w-[min(46rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-white/12 shadow-2xl backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
        <h2 className="text-xs font-semibold text-slate-300">
          {t('compareTitle')}
          <span className="ml-1.5 text-slate-500">({elements.length}/3)</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-white/10 hover:text-slate-100"
          >
            {collapsed ? '▲' : '▼'}
          </button>
          <button
            type="button"
            onClick={clearCompare}
            className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-white/10 hover:text-slate-100"
          >
            {t('clearCompare')}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="max-h-[38vh] overflow-auto p-3 sm:max-h-[46vh]">
          {elements.length < 2 && (
            <p className="pb-2 text-center text-[11px] text-slate-500">{t('compareEmpty')}</p>
          )}

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="w-28 px-1 py-1.5 text-left text-[10px] font-medium uppercase tracking-wide text-slate-600">
                  {t('properties')}
                </th>
                {elements.map((el) => {
                  const color = CATEGORY_COLORS[el.category]
                  return (
                    <th key={el.number} className="px-1 py-1.5 align-top">
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => select(el.number)}
                          className="flex flex-col items-center rounded-md border px-2 py-1 transition-colors hover:brightness-125"
                          style={{
                            borderColor: withAlpha(color, 0.45),
                            backgroundColor: withAlpha(color, 0.12),
                          }}
                        >
                          <span className="text-base font-semibold" style={{ color }}>
                            {el.symbol}
                          </span>
                          <span className="text-[10px] text-slate-300">
                            {elementName(el, locale)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCompare(el.number)}
                          aria-label={`${t('removeFromCompare')}: ${el.symbol}`}
                          className="text-[10px] text-slate-600 hover:text-slate-300"
                        >
                          ✕
                        </button>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              <tr className="border-t border-white/5">
                <td className="px-1 py-1.5 text-slate-500">{t('category')}</td>
                {elements.map((el) => (
                  <td
                    key={el.number}
                    className="px-1 py-1.5 text-center text-[11px]"
                    style={{ color: CATEGORY_COLORS[el.category] }}
                  >
                    {categoryName(el, locale)}
                  </td>
                ))}
              </tr>

              <tr className="border-t border-white/5">
                <td className="px-1 py-1.5 text-slate-500">{t('shellDistribution')}</td>
                {elements.map((el) => (
                  <td
                    key={el.number}
                    className="px-1 py-1.5 text-center tabular-nums text-slate-300"
                  >
                    {el.shells.join('-')}
                  </td>
                ))}
              </tr>

              <tr className="border-t border-white/5">
                <td className="px-1 py-1.5 text-slate-500">{t('electronConfigurationShort')}</td>
                {elements.map((el) => (
                  <td
                    key={el.number}
                    className="accent-text px-1 py-1.5 text-center font-mono text-[10px]"
                  >
                    {el.electronConfigurationShort}
                  </td>
                ))}
              </tr>

              {ROWS.map((key) => (
                <tr key={key} className="border-t border-white/5">
                  <td className="px-1 py-1.5 text-slate-500">{HEATMAP_LABELS[key][locale]}</td>
                  {elements.map((el) => (
                    <td
                      key={el.number}
                      className="px-1 py-1.5 text-center tabular-nums text-slate-300"
                    >
                      {formatValue(
                        el[key],
                        key === 'density' && el.phase === 'Gas' ? 'g/L' : PROPERTY_UNITS[key],
                        '—',
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  )
}
