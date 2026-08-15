interface ViewerButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}

/** Toggle button used by the control strip under both 3D viewers. */
export function ViewerButton({ active, onClick, children, title }: ViewerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'accent-active'
          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/25 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
