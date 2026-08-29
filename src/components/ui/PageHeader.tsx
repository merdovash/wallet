import type { CSSProperties, ReactNode } from 'react'
import { useAppSection } from '../../lib/useAppSection'
import { useFabKeyboardBottom } from '../../lib/useFabKeyboardBottom'
import { useCheckInUiStore } from '../../store/checkInUiStore'
import { usePrimaryActionStore } from '../../store/primaryActionStore'
import type { AppSection } from '../../types/wallet'

const FAB_CLASS =
  'fixed flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:hidden'

const TOOLBAR_CLASS =
  'hidden md:inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 2v3M16 2v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 14 2 2 4-4" />
    </svg>
  )
}

function useSectionPrimary(section: AppSection) {
  const override = usePrimaryActionStore((s) => s.override)
  const openCreate = useCheckInUiStore((s) => s.openCreate)
  const checkInOpen = useCheckInUiStore((s) => s.open)

  const sectionOverride = override && override.scope !== 'panel' ? override : null

  const label = sectionOverride?.label ?? 'Чек-ин'
  const disabled = sectionOverride?.disabled ?? false
  const title = sectionOverride?.title ?? (sectionOverride ? undefined : 'Новый чек-ин')
  const onClick = sectionOverride?.onClick ?? openCreate
  const showCheckIcon = !sectionOverride

  const hidden =
    (section === 'settings' && !sectionOverride) || (checkInOpen && !sectionOverride)

  return { hidden, label, disabled, title, onClick, showCheckIcon }
}

interface PrimaryActionButtonProps {
  section: AppSection
  /** Mobile floating button vs desktop page-header control. */
  variant: 'fab' | 'toolbar'
  className?: string
}

function FabButton({ section, className = '' }: { section: AppSection; className?: string }) {
  const override = usePrimaryActionStore((s) => s.override)
  const panelOverride = override?.scope === 'panel' ? override : null
  const sectionPrimary = useSectionPrimary(section)
  const keyboardBottom = useFabKeyboardBottom()
  const fabStyle: CSSProperties | undefined = keyboardBottom ? { bottom: keyboardBottom } : undefined

  if (panelOverride) {
    return (
      <button
        type="button"
        onClick={panelOverride.onClick}
        disabled={panelOverride.disabled}
        title={panelOverride.title}
        aria-label={panelOverride.label}
        style={fabStyle}
        className={`z-[110] ${FAB_CLASS} ${className}`}
      >
        <span>{panelOverride.label}</span>
      </button>
    )
  }

  if (sectionPrimary.hidden) return null

  return (
    <button
      type="button"
      onClick={sectionPrimary.onClick}
      disabled={sectionPrimary.disabled}
      title={sectionPrimary.title}
      aria-label={sectionPrimary.label}
      style={fabStyle}
      className={`z-[90] ${FAB_CLASS} ${className}`}
    >
      {sectionPrimary.showCheckIcon && <CheckIcon className="h-5 w-5 shrink-0" aria-hidden />}
      <span>{sectionPrimary.label}</span>
    </button>
  )
}

function ToolbarButton({ section, className = '' }: { section: AppSection; className?: string }) {
  const override = usePrimaryActionStore((s) => s.override)
  const panelOverride = override?.scope === 'panel' ? override : null
  const sectionPrimary = useSectionPrimary(section)

  if (panelOverride || sectionPrimary.hidden) return null

  return (
    <button
      type="button"
      onClick={sectionPrimary.onClick}
      disabled={sectionPrimary.disabled}
      title={sectionPrimary.title}
      aria-label={sectionPrimary.label}
      className={`${TOOLBAR_CLASS} ${className}`}
    >
      {sectionPrimary.showCheckIcon && <CheckIcon className="h-4 w-4 shrink-0" aria-hidden />}
      <span>{sectionPrimary.label}</span>
    </button>
  )
}

export function PrimaryActionButton({ section, variant, className = '' }: PrimaryActionButtonProps) {
  if (variant === 'fab') {
    return <FabButton section={section} className={className} />
  }
  return <ToolbarButton section={section} className={className} />
}

/** Плавающая кнопка — только на узких экранах. */
export function PrimaryFab({ section }: { section: AppSection }) {
  return <PrimaryActionButton section={section} variant="fab" />
}

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Secondary controls — on desktop sit to the left of the primary action. */
  actions?: ReactNode
  /** Show section primary (чек-ин / добавить счёт). Default true. Desktop only. */
  showPrimary?: boolean
  className?: string
}

/** Заголовок раздела: на десктопе primary справа; в адаптиве primary только в FAB. */
export function PageHeader({
  title,
  description,
  actions,
  showPrimary = true,
  className = '',
}: PageHeaderProps) {
  const [section] = useAppSection()

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-200">{title}</h1>
          {description ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">{description}</div>
          ) : null}
        </div>

        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 md:flex-1">
          {actions}
          {showPrimary ? (
            <PrimaryActionButton section={section} variant="toolbar" />
          ) : null}
        </div>
      </div>
    </div>
  )
}
