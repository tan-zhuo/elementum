import { Suspense, lazy, useCallback, useEffect, useMemo } from 'react'
import type { Molecule } from '../../types/molecule'
import {
  MOLECULES,
  MOLECULE_CATEGORY_COLORS,
  MOLECULE_CATEGORY_LABELS,
  atomColor,
  bondSummary,
  composition,
  moleculeName,
  moleculeEveryday,
  moleculeShape,
  moleculeSummary,
  moleculeUses,
} from '../../data/molecules'
import { getElementBySymbol } from '../../data/elements'
import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'
import { withAlpha } from '../../lib/color'
import { UsesSection } from '../UsesSection/UsesSection'

// three.js only loads once a 3D panel is actually opened.
const MoleculeModel = lazy(() =>
  import('../MoleculeModel/MoleculeModel').then((m) => ({ default: m.MoleculeModel })),
)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-xs text-slate-200">{value}</dd>
    </div>
  )
}

export function MoleculeDetail({ molecule }: { molecule: Molecule }) {
  const locale = useAppStore((s) => s.locale)
  const selectMolecule = useAppStore((s) => s.selectMolecule)
  const select = useAppStore((s) => s.select)
  const setView = useAppStore((s) => s.setView)
  const viewerFullscreen = useAppStore((s) => s.viewerFullscreen)

  const t = useCallback((key: Parameters<typeof translate>[0]) => translate(key, locale), [locale])

  const color = MOLECULE_CATEGORY_COLORS[molecule.category]
  const elements = useMemo(() => composition(molecule), [molecule])
  const bonds = useMemo(() => bondSummary(molecule), [molecule])

  const index = MOLECULES.findIndex((m) => m.id === molecule.id)
  const step = useCallback(
    (delta: number) => {
      const next = MOLECULES[index + delta]
      if (next) selectMolecule(next.id)
    },
    [index, selectMolecule],
  )

  // Same contract as the element panel: Escape closes, arrows walk the list, and
  // both defer while the 3D viewer is maximised.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if (event.key === 'Escape' && !viewerFullscreen) {
        selectMolecule(null)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        step(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        step(-1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectMolecule, step, viewerFullscreen])

  /** Jumps to this element's page in the periodic table. */
  const openElement = (symbol: string) => {
    const element = getElementBySymbol(symbol)
    if (!element) return
    setView('elements')
    select(element.number)
  }

  // Distinct bond lengths, so the readout stays short for symmetric molecules.
  const distinctBonds = useMemo(() => {
    const seen = new Map<string, { label: string; length: number }>()
    for (const bond of molecule.bonds) {
      const a = molecule.atoms[bond.a].element
      const b = molecule.atoms[bond.b].element
      const symbol = bond.order === 1 ? '—' : bond.order === 2 ? '=' : '≡'
      const label = `${a}${symbol}${b}`
      if (!seen.has(label)) seen.set(label, { label, length: bond.length })
    }
    return [...seen.values()]
  }, [molecule])

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-start gap-4 border-b border-white/10 p-4"
        style={{ background: `linear-gradient(90deg, ${withAlpha(color, 0.16)}, transparent 70%)` }}
      >
        <div
          className="flex h-16 min-w-16 shrink-0 items-center justify-center rounded-xl border px-3"
          style={{ borderColor: withAlpha(color, 0.5), backgroundColor: withAlpha(color, 0.12) }}
        >
          <span className="text-xl font-semibold" style={{ color }}>
            {molecule.formulaDisplay}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold text-slate-50">
            {moleculeName(molecule, locale)}
          </h2>
          <p className="truncate text-sm text-slate-400">
            {locale === 'zh' ? molecule.name : molecule.nameZh}
          </p>
          <p className="mt-1 text-xs font-medium" style={{ color }}>
            {MOLECULE_CATEGORY_LABELS[molecule.category][locale]} · {moleculeShape(molecule, locale)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={index <= 0}
            aria-label={t('previousItem')}
            className="rounded-md border border-white/10 px-2 py-1 text-slate-400 transition-colors hover:border-white/30 hover:text-slate-100 disabled:opacity-30 disabled:hover:border-white/10"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={index >= MOLECULES.length - 1}
            aria-label={t('nextItem')}
            className="rounded-md border border-white/10 px-2 py-1 text-slate-400 transition-colors hover:border-white/30 hover:text-slate-100 disabled:opacity-30 disabled:hover:border-white/10"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => selectMolecule(null)}
            aria-label={t('close')}
            className="ml-1 rounded-md border border-white/10 px-2 py-1 text-slate-400 transition-colors hover:border-white/30 hover:text-slate-100"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col gap-4">
          <UsesSection
            prose={moleculeUses(molecule, locale)}
            everyday={moleculeEveryday(molecule, locale)}
            color={color}
          />

          <Section title={t('overview')}>
            <dl className="divide-y divide-white/5">
              <Row label={t('molarMass')} value={`${molecule.molarMass.toFixed(3)} g/mol`} />
              <Row label={t('shape')} value={moleculeShape(molecule, locale)} />
              <Row label={t('atoms')} value={molecule.atoms.length} />
              <Row
                label={t('bonds')}
                value={
                  [
                    bonds.single ? `${bonds.single} ${t('bondSingle')}` : null,
                    bonds.double ? `${bonds.double} ${t('bondDouble')}` : null,
                    bonds.triple ? `${bonds.triple} ${t('bondTriple')}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || molecule.bonds.length
                }
              />
            </dl>
          </Section>

          <Section title={t('composition')}>
            <div className="flex flex-wrap gap-1.5">
              {elements.map(({ symbol, count }) => {
                const element = getElementBySymbol(symbol)
                return (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => openElement(symbol)}
                    title={`${t('viewElementDetail')}: ${element?.nameZh ?? symbol}`}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] transition-colors hover:border-white/30"
                  >
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full ring-1 ring-white/20"
                      style={{ backgroundColor: atomColor(symbol) }}
                    />
                    <span className="font-semibold text-slate-100">{symbol}</span>
                    <span className="text-slate-400">
                      {locale === 'zh' ? element?.nameZh : element?.name}
                    </span>
                    <span className="tabular-nums text-slate-500">×{count}</span>
                  </button>
                )
              })}
            </div>
          </Section>

          <Section title={t('bondLengths')}>
            <dl className="divide-y divide-white/5">
              {distinctBonds.map((bond) => (
                <Row
                  key={bond.label}
                  label={<span className="font-mono">{bond.label}</span>}
                  value={<span className="tabular-nums">{bond.length.toFixed(3)} Å</span>}
                />
              ))}
            </dl>
            {/* Say so rather than letting three decimal places imply measurement. */}
            {molecule.idealized && (
              <p className="mt-2.5 flex items-start gap-1.5 border-t border-white/5 pt-2.5 text-[11px] text-amber-300/70">
                <span aria-hidden>⚠</span>
                <span>
                  <span className="font-medium">{t('idealizedGeometry')}</span> ·{' '}
                  {t('idealizedNote')}
                </span>
              </p>
            )}
          </Section>

          <Section title={t('summary')}>
            <p className="text-xs leading-relaxed text-slate-300">
              {moleculeSummary(molecule, locale)}
            </p>
          </Section>
        </div>

        {/* 3D viewer leads on narrow screens, same as the element panel. */}
        <div className="order-first lg:order-none lg:sticky lg:top-0 lg:h-[calc(100vh-11rem)]">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {t('moleculeStructure')}
            </h3>
            <span className="text-[10px] text-slate-600">{t('keyboardHints')}</span>
          </div>
          <div className="h-[24rem] lg:h-[calc(100%-1.75rem)]">
            <Suspense
              fallback={
                <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-sm text-slate-500">
                  {t('loading3d')}
                </div>
              }
            >
              <MoleculeModel molecule={molecule} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
