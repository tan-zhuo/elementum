import { memo } from 'react'
import type { Element, Locale } from '../../types/element'
import { CATEGORY_COLORS } from '../../data/categories'
import { elementName } from '../../data/elements'
import { luminance, rgbStringToHex, withAlpha } from '../../lib/color'

export interface ElementCellProps {
  element: Element
  locale: Locale
  /** Dimmed when a search or category filter excludes this element. */
  dimmed: boolean
  selected: boolean
  /** Queued for comparison — gets a persistent outline. */
  comparing: boolean
  /** Heat-map colour as `rgb(...)`, or null to colour by category. */
  heatColor: string | null
  onSelect: (number: number) => void
  onHover: (number: number | null, rect: DOMRect | null) => void
}

function ElementCellImpl({
  element,
  locale,
  dimmed,
  selected,
  comparing,
  heatColor,
  onSelect,
  onHover,
}: ElementCellProps) {
  const categoryColor = CATEGORY_COLORS[element.category]

  // In heat-map mode the fill carries the data, so it is opaque and the text flips
  // to whichever of black/white stays readable on it. Elements with no value for the
  // active property fall back to a flat grey rather than a misleading ramp colour.
  const heatMode = heatColor !== null
  const background = heatMode ? heatColor : withAlpha(categoryColor, 0.13)
  const textColor = heatMode
    ? luminance(rgbStringToHex(heatColor)) > 0.45
      ? '#0B1120'
      : '#F8FAFC'
    : categoryColor
  const borderColor = heatMode ? withAlpha('#ffffff', 0.12) : withAlpha(categoryColor, 0.32)

  return (
    <button
      type="button"
      onClick={() => onSelect(element.number)}
      onMouseEnter={(e) => onHover(element.number, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => onHover(null, null)}
      onFocus={(e) => onHover(element.number, e.currentTarget.getBoundingClientRect())}
      onBlur={() => onHover(null, null)}
      aria-label={`${element.number} ${element.symbol} ${elementName(element, locale)}`}
      aria-pressed={selected}
      style={{
        gridColumn: element.xpos + 1,
        gridRow: element.ypos + 1,
        background,
        borderColor: selected ? categoryColor : borderColor,
        color: textColor,
        boxShadow: selected ? `0 0 0 1px ${categoryColor}, 0 0 18px ${withAlpha(categoryColor, 0.5)}` : undefined,
      }}
      className={`group relative flex aspect-square min-w-0 cursor-pointer flex-col items-center justify-center rounded-[5px] border p-0.5 transition-[transform,opacity,box-shadow] duration-150 hover:z-10 hover:scale-[1.14] hover:shadow-lg focus:z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        dimmed ? 'opacity-[0.16] saturate-50' : 'opacity-100'
      }`}
    >
      <span className="absolute left-1 top-0.5 text-[8px] leading-none opacity-70 tabular-nums lg:text-[9px]">
        {element.number}
      </span>

      {comparing && (
        <span
          aria-hidden
          className="absolute right-1 top-0.5 h-1.5 w-1.5 rounded-full bg-white"
          style={{ boxShadow: '0 0 6px rgba(255,255,255,0.9)' }}
        />
      )}

      <span className="text-[13px] font-semibold leading-none sm:text-base lg:text-lg">
        {element.symbol}
      </span>

      <span
        className="mt-0.5 hidden w-full truncate px-0.5 text-center text-[8px] leading-tight opacity-80 sm:block lg:text-[9px]"
        style={heatMode ? undefined : { color: 'rgb(203 213 225)' }}
      >
        {elementName(element, locale)}
      </span>
    </button>
  )
}

/** 118 cells re-render on every hover without this. */
export const ElementCell = memo(ElementCellImpl)
