import {
  MOLECULES,
  MOLECULE_CATEGORY_COLORS,
  MOLECULE_CATEGORY_LABELS,
  MOLECULE_CATEGORY_ORDER,
} from '../../data/molecules'
import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'
import { withAlpha } from '../../lib/color'

/** Category chips for the molecule gallery, mirroring the periodic table's legend. */
export function MoleculeFilter() {
  const locale = useAppStore((s) => s.locale)
  const active = useAppStore((s) => s.activeMoleculeCategories)
  const toggle = useAppStore((s) => s.toggleMoleculeCategory)
  const query = useAppStore((s) => s.query)
  const clearFilters = useAppStore((s) => s.clearFilters)

  const anyFilter = active.length > 0 || query.trim().length > 0

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-x-visible sm:pb-0">
      {MOLECULE_CATEGORY_ORDER.map((key) => {
        const color = MOLECULE_CATEGORY_COLORS[key]
        const isActive = active.includes(key)
        // With no explicit selection every category reads as active.
        const emphasised = isActive || active.length === 0
        const count = MOLECULES.filter((m) => m.category === key).length
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            aria-pressed={isActive}
            style={{
              borderColor: withAlpha(color, isActive ? 0.85 : 0.28),
              backgroundColor: withAlpha(color, isActive ? 0.2 : 0.06),
              color: emphasised ? color : withAlpha(color, 0.45),
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: color, opacity: emphasised ? 1 : 0.4 }}
            />
            {MOLECULE_CATEGORY_LABELS[key][locale]}
            <span className="tabular-nums opacity-60">{count}</span>
          </button>
        )
      })}

      {anyFilter && (
        <button
          type="button"
          onClick={clearFilters}
          className="ml-1 shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:border-white/35 hover:text-slate-100"
        >
          {translate('clearFilters', locale)}
        </button>
      )}
    </div>
  )
}
