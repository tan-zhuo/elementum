import { useAppStore } from '../../stores/useAppStore'
import { translate } from '../../i18n'
import { withAlpha } from '../../lib/color'

interface UsesSectionProps {
  /** One or two sentences on what the thing is actually for. */
  prose: string
  /** Concrete everyday applications; may be empty. */
  everyday: string[]
  /** Accent colour, taken from the item's category. */
  color: string
}

/**
 * "What it is used for" — shared by the element and molecule panels.
 *
 * An empty `everyday` list is meaningful rather than missing data: the synthetic
 * elements have no applications at all, so the section says so outright instead of
 * hiding the fact behind a blank space.
 */
export function UsesSection({ prose, everyday, color }: UsesSectionProps) {
  const locale = useAppStore((s) => s.locale)

  return (
    <section
      className="rounded-xl border p-4"
      style={{ borderColor: withAlpha(color, 0.28), backgroundColor: withAlpha(color, 0.06) }}
    >
      <h3
        className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider"
        style={{ color }}
      >
        {translate('uses', locale)}
      </h3>

      <p className="text-[13px] leading-relaxed text-slate-200">{prose}</p>

      {everyday.length > 0 ? (
        <div className="mt-3 border-t border-white/8 pt-3">
          <div className="mb-2 text-[11px] text-slate-500">{translate('everyday', locale)}</div>
          <ul className="flex flex-wrap gap-1.5">
            {everyday.map((item) => (
              <li
                key={item}
                className="rounded-md border px-2 py-1 text-[11px] text-slate-200"
                style={{
                  borderColor: withAlpha(color, 0.3),
                  backgroundColor: withAlpha(color, 0.1),
                }}
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2.5 border-t border-white/8 pt-2.5 text-[11px] text-slate-500">
          {translate('noKnownUse', locale)}
        </p>
      )}
    </section>
  )
}
