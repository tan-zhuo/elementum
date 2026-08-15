import { useMemo } from 'react'
import type { Molecule, MoleculeCategory } from '../../types/molecule'
import {
  MOLECULES,
  MOLECULE_CATEGORY_COLORS,
  MOLECULE_CATEGORY_LABELS,
  MOLECULE_CATEGORY_ORDER,
  atomColor,
  composition,
  moleculeName,
  searchMolecules,
} from '../../data/molecules'
import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'
import { withAlpha } from '../../lib/color'

function MoleculeCard({ molecule, onOpen }: { molecule: Molecule; onOpen: (id: string) => void }) {
  const locale = useAppStore((s) => s.locale)
  const color = MOLECULE_CATEGORY_COLORS[molecule.category]
  const elements = composition(molecule)

  return (
    <button
      type="button"
      onClick={() => onOpen(molecule.id)}
      aria-label={`${molecule.formulaDisplay} ${moleculeName(molecule, locale)}`}
      style={{ borderColor: withAlpha(color, 0.3), backgroundColor: withAlpha(color, 0.05) }}
      className="group flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <div className="flex w-full items-baseline justify-between gap-2">
        <span className="text-xl font-semibold tracking-tight text-slate-50">
          {molecule.formulaDisplay}
        </span>
        <span className="text-[10px] tabular-nums text-slate-500">
          {molecule.molarMass.toFixed(2)}
        </span>
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm text-slate-200">{moleculeName(molecule, locale)}</div>
        <div className="truncate text-[11px] text-slate-500">
          {locale === 'zh' ? molecule.name : molecule.nameZh}
        </div>
      </div>

      {/* Atom colour swatches double as a hint of what the 3D model looks like. */}
      <div className="mt-auto flex items-center gap-1 pt-1">
        {elements.map(({ symbol, count }) => (
          <span key={symbol} className="flex items-center gap-0.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-full ring-1 ring-white/20"
              style={{ backgroundColor: atomColor(symbol) }}
            />
            <span className="text-[10px] tabular-nums text-slate-500">{count}</span>
          </span>
        ))}
        <span className="ml-1 text-[10px]" style={{ color }}>
          {molecule.shapeZh && locale === 'zh' ? molecule.shapeZh : molecule.shape.replace(/-/g, ' ')}
        </span>
      </div>
    </button>
  )
}

export function MoleculeGallery() {
  const locale = useAppStore((s) => s.locale)
  const query = useAppStore((s) => s.query)
  const selectMolecule = useAppStore((s) => s.selectMolecule)

  const matches = useMemo(() => new Set(searchMolecules(query)), [query])

  const grouped = useMemo(() => {
    return MOLECULE_CATEGORY_ORDER.map((category) => ({
      category,
      items: MOLECULES.filter((m) => m.category === category && matches.has(m.id)),
    })).filter((group) => group.items.length > 0)
  }, [matches])

  if (grouped.length === 0) {
    return (
      <p className="px-2 py-10 text-center text-sm text-slate-500">
        {translate('moleculeNoResults', locale)}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {grouped.map(({ category, items }) => (
        <section key={category}>
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: MOLECULE_CATEGORY_COLORS[category as MoleculeCategory] }}
            />
            {MOLECULE_CATEGORY_LABELS[category as MoleculeCategory][locale]}
            <span className="text-slate-600">({items.length})</span>
          </h2>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((molecule) => (
              <MoleculeCard key={molecule.id} molecule={molecule} onOpen={selectMolecule} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
