import { usePrimaryActionStore } from '../../store/primaryActionStore'
import { useCheckInUiStore } from '../../store/checkInUiStore'

/** Плавающая кнопка основного действия: чек-ин или переопределение (Сохранить). */
export function PrimaryFab() {
  const override = usePrimaryActionStore((s) => s.override)
  const openCreate = useCheckInUiStore((s) => s.openCreate)
  const checkInOpen = useCheckInUiStore((s) => s.open)

  const label = override?.label ?? 'Чек-ин'
  const disabled = override?.disabled ?? false
  const title = override?.title ?? (override ? undefined : 'Новый чек-ин')
  const onClick = override?.onClick ?? openCreate

  // Пока открыт чек-ин без override — скрываем FAB (override зарегистрирует Save).
  if (checkInOpen && !override) return null

  // Чек-ин под StackPanel (z-100); Save при редактировании — поверх панели.
  const zClass = override ? 'z-[110]' : 'z-[90]'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      className={`fixed ${zClass} flex h-14 min-w-14 items-center justify-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:right-6`}
    >
      {!override && <CheckIcon className="h-5 w-5 shrink-0" aria-hidden />}
      <span>{label}</span>
    </button>
  )
}

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
