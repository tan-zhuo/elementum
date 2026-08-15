import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import type { Element } from '../../types/element'
import { CATEGORY_COLORS, SHELL_COLORS, SHELL_LABELS } from '../../data/categories'
import { ELEMENTS, categoryName, elementName, formatValue, neutronCount } from '../../data/elements'
import { useAppStore, MAX_COMPARE } from '../../stores/useAppStore'
import { PROPERTY_UNITS, translate } from '../../i18n'
import { withAlpha } from '../../lib/color'

// three.js and R3F are by far the heaviest dependency here and are only needed once
// a detail panel opens, so they load on demand rather than blocking the table.
const AtomModel = lazy(() =>
  import('../AtomModel/AtomModel').then((m) => ({ default: m.AtomModel })),
)

interface DetailProps {
  element: Element
}

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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right text-xs text-slate-200">{value}</dd>
    </div>
  )
}

export function ElementDetail({ element }: DetailProps) {
  const locale = useAppStore((s) => s.locale)
  const select = useAppStore((s) => s.select)
  const compare = useAppStore((s) => s.compare)
  const toggleCompare = useAppStore((s) => s.toggleCompare)
  const viewerFullscreen = useAppStore((s) => s.viewerFullscreen)
  const [copied, setCopied] = useState(false)

  const t = useCallback(
    (key: Parameters<typeof translate>[0]) => translate(key, locale),
    [locale],
  )

  const color = CATEGORY_COLORS[element.category]
  const inCompare = compare.includes(element.number)
  const compareFull = compare.length >= MAX_COMPARE && !inCompare

  const step = useCallback(
    (delta: number) => {
      const next = element.number + delta
      if (next >= 1 && next <= ELEMENTS.length) select(next)
    },
    [element.number, select],
  )

  // Escape closes, arrows walk the table. Suspended while the 3D viewer is
  // maximised so its own Escape handler can run first.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if (event.key === 'Escape' && !viewerFullscreen) {
        select(null)
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
  }, [select, step, viewerFullscreen])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    const lines = [
      `${element.number}. ${element.symbol} — ${element.nameZh} / ${element.name}`,
      `${t('category')}: ${categoryName(element, locale)}`,
      `${t('atomicMass')}: ${formatValue(element.atomicMass, PROPERTY_UNITS.atomicMass, t('noData'))}`,
      `${t('electronConfiguration')}: ${element.electronConfiguration}`,
      `${t('shellDistribution')}: ${element.shells.join(', ')}`,
      `${t('melt')}: ${formatValue(element.melt, PROPERTY_UNITS.melt, t('noData'))}`,
      `${t('boil')}: ${formatValue(element.boil, PROPERTY_UNITS.boil, t('noData'))}`,
      `${t('electronegativity')}: ${formatValue(element.electronegativity, '', t('noData'))}`,
      element.source,
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
    } catch {
      // Clipboard is unavailable over plain HTTP and in some embedded webviews;
      // there is nothing useful to recover to, so leave the button unchanged.
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-start gap-4 border-b border-white/10 p-4"
        style={{ background: `linear-gradient(90deg, ${withAlpha(color, 0.16)}, transparent 70%)` }}
      >
        <div
          className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border"
          style={{ borderColor: withAlpha(color, 0.5), backgroundColor: withAlpha(color, 0.12) }}
        >
          <span className="text-2xl font-semibold" style={{ color }}>
            {element.symbol}
          </span>
          <span className="text-[10px] tabular-nums text-slate-400">{element.number}</span>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold text-slate-50">
            {elementName(element, locale)}
          </h2>
          <p className="truncate text-sm text-slate-400">
            {locale === 'zh' ? element.name : element.nameZh}
          </p>
          <p className="mt-1 text-xs font-medium" style={{ color }}>
            {categoryName(element, locale)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={element.number === 1}
            aria-label={t('previousElement')}
            className="rounded-md border border-white/10 px-2 py-1 text-slate-400 transition-colors hover:border-white/30 hover:text-slate-100 disabled:opacity-30 disabled:hover:border-white/10"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={element.number === ELEMENTS.length}
            aria-label={t('nextElement')}
            className="rounded-md border border-white/10 px-2 py-1 text-slate-400 transition-colors hover:border-white/30 hover:text-slate-100 disabled:opacity-30 disabled:hover:border-white/10"
          >
            →
          </button>
          <button
            type="button"
            onClick={() => select(null)}
            aria-label={t('close')}
            className="ml-1 rounded-md border border-white/10 px-2 py-1 text-slate-400 transition-colors hover:border-white/30 hover:text-slate-100"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="flex flex-col gap-4">
          <Section title={t('overview')}>
            <dl className="divide-y divide-white/5">
              <Row
                label={t('atomicMass')}
                value={formatValue(element.atomicMass, PROPERTY_UNITS.atomicMass, t('noData'))}
              />
              <Row label={t('period')} value={element.period} />
              <Row label={t('group')} value={element.group} />
              <Row label={t('block')} value={`${element.block}`} />
              <Row label={t('phase')} value={element.phase} />
              {element.appearance && <Row label={t('appearance')} value={element.appearance} />}
              <Row label={t('discoveredBy')} value={element.discoveredBy ?? t('noData')} />
              {element.namedBy && <Row label={t('namedBy')} value={element.namedBy} />}
            </dl>
          </Section>

          <Section title={t('electronStructure')}>
            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-slate-500">{t('electronConfiguration')}</div>
                <div className="mt-0.5 break-words font-mono text-sm text-slate-100">
                  {element.electronConfiguration}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">{t('electronConfigurationShort')}</div>
                <div className="mt-0.5 break-words font-mono text-sm text-cyan-300">
                  {element.electronConfigurationShort}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[11px] text-slate-500">{t('shellDistribution')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {element.shells.map((count, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]"
                      style={{
                        borderColor: withAlpha(SHELL_COLORS[i % SHELL_COLORS.length], 0.4),
                        backgroundColor: withAlpha(SHELL_COLORS[i % SHELL_COLORS.length], 0.1),
                      }}
                    >
                      <span
                        className="font-semibold"
                        style={{ color: SHELL_COLORS[i % SHELL_COLORS.length] }}
                      >
                        {SHELL_LABELS[i]}
                      </span>
                      <span className="tabular-nums text-slate-200">{count}</span>
                    </span>
                  ))}
                </div>
              </div>

              <dl className="divide-y divide-white/5 border-t border-white/5 pt-1">
                <Row label={t('protons')} value={element.number} />
                <Row label={t('neutrons')} value={neutronCount(element)} />
                <Row label={t('electrons')} value={element.number} />
              </dl>
            </div>
          </Section>

          <Section title={t('properties')}>
            <dl className="divide-y divide-white/5">
              <Row
                label={t('density')}
                value={formatValue(
                  element.density,
                  element.phase === 'Gas' ? 'g/L' : PROPERTY_UNITS.density,
                  t('noData'),
                )}
              />
              <Row
                label={t('melt')}
                value={formatValue(element.melt, PROPERTY_UNITS.melt, t('noData'))}
              />
              <Row
                label={t('boil')}
                value={formatValue(element.boil, PROPERTY_UNITS.boil, t('noData'))}
              />
              <Row
                label={t('molarHeat')}
                value={formatValue(element.molarHeat, PROPERTY_UNITS.molarHeat, t('noData'))}
              />
              <Row
                label={t('electronegativity')}
                value={formatValue(element.electronegativity, '', t('noData'))}
              />
              <Row
                label={t('ionizationEnergy')}
                value={formatValue(
                  element.ionizationEnergy,
                  PROPERTY_UNITS.ionizationEnergy,
                  t('noData'),
                )}
              />
              <Row
                label={t('electronAffinity')}
                value={formatValue(
                  element.electronAffinity,
                  PROPERTY_UNITS.electronAffinity,
                  t('noData'),
                )}
              />
              <Row
                label={t('atomicRadius')}
                value={formatValue(element.atomicRadius, PROPERTY_UNITS.atomicRadius, t('noData'))}
              />
            </dl>
          </Section>

          <Section title={t('summary')}>
            <p className="text-xs leading-relaxed text-slate-300">{element.summary}</p>
            <a
              href={element.source}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block text-xs text-cyan-400 hover:text-cyan-300 hover:underline"
            >
              {t('readMore')} ↗
            </a>
          </Section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggleCompare(element.number)}
              disabled={compareFull}
              title={compareFull ? t('compareFull') : undefined}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                inCompare
                  ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-200'
                  : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/30 hover:text-slate-100'
              }`}
            >
              {inCompare ? t('removeFromCompare') : t('addToCompare')}
            </button>
            <button
              type="button"
              onClick={copy}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-white/30 hover:text-slate-100"
            >
              {copied ? t('copied') : t('copyInfo')}
            </button>
          </div>
        </div>

        {/* 3D viewer. On narrow screens it leads, so the headline feature is not
            buried under four sections of text; on desktop it sits in the right
            column and sticks while the left column scrolls. */}
        <div className="order-first lg:order-none lg:sticky lg:top-0 lg:h-[calc(100vh-11rem)]">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {t('atomModel')}
            </h3>
            <span className="text-[10px] text-slate-600">{t('keyboardHints')}</span>
          </div>
          {/* Deliberately not keyed by element: the scene rebuilds its shells from
              props, so switching elements never tears down the WebGL context. */}
          <div className="h-[24rem] lg:h-[calc(100%-1.75rem)]">
            <Suspense
              fallback={
                <div className="flex h-full min-h-64 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-sm text-slate-500">
                  {t('loading3d')}
                </div>
              }
            >
              <AtomModel element={element} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  )
}
