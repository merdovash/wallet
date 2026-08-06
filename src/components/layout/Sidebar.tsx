import { useEffect, useState, type SVGProps } from 'react'
import { sectionToPath } from '../../lib/appRoutes'
import { portalHomeUrl } from '../../lib/portalUrl'
import type { AppSection } from '../../types/wallet'
import { AuthControls } from './AuthControls'

type NavIcon = (props: SVGProps<SVGSVGElement>) => React.ReactElement

const NAV_ITEMS: { id: AppSection; label: string; Icon: NavIcon }[] = [
  { id: 'dashboard', label: 'Дашборд', Icon: ChartIcon },
  { id: 'checkins', label: 'Чек-ины', Icon: CheckInIcon },
  { id: 'daily', label: 'По дням', Icon: DailyIcon },
  { id: 'accounts', label: 'Счета', Icon: AccountsIcon },
  { id: 'types', label: 'По типам', Icon: TypesIcon },
  { id: 'currencies', label: 'Валюты', Icon: CurrenciesIcon },
  { id: 'monthly', label: 'Помесячно', Icon: MonthlyIcon },
  { id: 'float', label: 'Float', Icon: FloatIcon },
  { id: 'settings', label: 'Настройки', Icon: SettingsIcon },
]

interface SidebarProps {
  active: AppSection
  onChange: (section: AppSection) => void
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
}

export function Sidebar({ active, onChange, collapsed, onCollapsedChange }: SidebarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!mobileMenuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [mobileMenuOpen])

  function selectSection(id: AppSection) {
    onChange(id)
    setMobileMenuOpen(false)
  }

  return (
    <div className="shrink-0 md:contents">
      <aside className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom,0px)] md:hidden">
        <nav className="flex items-stretch gap-0.5 overflow-x-auto px-1 py-1.5">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            title="Меню"
            aria-label="Открыть меню"
            aria-expanded={mobileMenuOpen}
            className="flex min-w-[3rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-slate-600 hover:bg-slate-100"
          >
            <MenuIcon className="h-5 w-5" aria-hidden />
            <span className="text-[10px] font-medium leading-none">Меню</span>
          </button>
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <NavButton
              key={id}
              id={id}
              label={label}
              Icon={Icon}
              isActive={active === id}
              mode="icon"
              onChange={selectSection}
            />
          ))}
        </nav>
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[55] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Закрыть меню"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-slate-200 bg-white shadow-xl"
            style={{ animation: 'mobile-drawer-in 180ms ease-out' }}
            aria-label="Навигация"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <PortalHomeLink />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
              >
                Закрыть
              </button>
            </div>
            <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
              {NAV_ITEMS.map(({ id, label, Icon }) => (
                <NavButton
                  key={id}
                  id={id}
                  label={label}
                  Icon={Icon}
                  isActive={active === id}
                  mode="full"
                  onChange={selectSection}
                />
              ))}
            </nav>
            <div className="shrink-0 border-t border-slate-200 p-3">
              <AuthControls />
            </div>
          </aside>
        </div>
      )}

      <aside
        className={`absolute inset-y-0 left-0 z-50 hidden flex-col border-r border-slate-200 bg-white shadow-md transition-[width] duration-200 md:flex ${
          collapsed ? 'w-14' : 'w-56'
        }`}
      >
        <div
          className={`shrink-0 border-b border-slate-100 px-3 py-3 ${collapsed ? 'flex justify-center' : ''}`}
        >
          <PortalHomeLink collapsed={collapsed} />
        </div>
        <nav
          className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-3 ${
            collapsed ? 'items-center px-2' : ''
          }`}
        >
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <NavButton
              key={id}
              id={id}
              label={label}
              Icon={Icon}
              isActive={active === id}
              mode={collapsed ? 'icon' : 'full'}
              onChange={onChange}
            />
          ))}
        </nav>

        <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white p-2">
          {!collapsed && <AuthControls />}
          <button
            type="button"
            onClick={() => onCollapsedChange(!collapsed)}
            className="flex w-full items-center justify-center rounded-lg px-2 py-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            <CollapseIcon className={`h-5 w-5 transition ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </aside>
    </div>
  )
}

function PortalHomeLink({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <a
      href={portalHomeUrl()}
      title="На главную"
      aria-label="На главную"
      className={`flex items-center gap-2 rounded-lg text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 ${
        collapsed ? 'justify-center p-1.5' : 'px-1 py-0.5'
      }`}
    >
      <HomeIcon className="h-5 w-5 shrink-0 text-blue-600" aria-hidden />
      {!collapsed && <span className="text-sm font-semibold text-slate-900">Портал</span>}
    </a>
  )
}

function NavButton({
  id,
  label,
  Icon,
  isActive,
  mode,
  onChange,
}: {
  id: AppSection
  label: string
  Icon: NavIcon
  isActive: boolean
  mode: 'icon' | 'full'
  onChange: (id: AppSection) => void
}) {
  const base =
    mode === 'icon'
      ? 'flex min-w-[3rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5'
      : 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm'
  const activeCls = isActive
    ? 'bg-blue-50 text-blue-700'
    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'

  return (
    <a
      href={sectionToPath(id)}
      onClick={(e) => {
        e.preventDefault()
        onChange(id)
      }}
      title={label}
      aria-current={isActive ? 'page' : undefined}
      className={`${base} ${activeCls}`}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      {mode === 'icon' ? (
        <span className="text-[10px] font-medium leading-none">{label}</span>
      ) : (
        <span className="truncate font-medium">{label}</span>
      )}
    </a>
  )
}

function iconProps(props: SVGProps<SVGSVGElement>) {
  return {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    ...props,
  }
}

function ChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-7" />
    </svg>
  )
}

function CheckInIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 2v3M16 2v3M4 9h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 14 2 2 4-4" />
    </svg>
  )
}

function AccountsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7h18M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M8 11h8M8 15h5"
      />
    </svg>
  )
}

function TypesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h6v6H4V6ZM14 6h6v4h-6V6ZM14 14h6v4h-6v-4ZM4 16h6v2H4v-2Z"
      />
    </svg>
  )
}

function CurrenciesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v18M16.5 7.5c-.8-1-2-1.5-4.5-1.5s-3.7.5-4.5 1.5S7 9.5 7 10.5s.5 2 2 2.5c1.8.6 5 .9 6.5 1.5 1.4.6 2 1.4 2 2.5s-.8 2.2-2.5 2.8c-1.4.5-3.2.5-5 0"
      />
    </svg>
  )
}

function MonthlyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 19V5M4 19h16M7 15l3-4 3 2 4-6"
      />
    </svg>
  )
}

function DailyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5M4 19h16M7 15v-3M11 15V9M15 15v-6M19 15v-2" />
    </svg>
  )
}

function FloatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 19V5M4 19h16M7 15c1.5-2 3-3 5-3s3.5 1 5 3M7 10c1.5-2 3-3 5-3s3.5 1 5 3"
      />
    </svg>
  )
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
      />
    </svg>
  )
}

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function CollapseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 6 9 12l6 6" />
    </svg>
  )
}

function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps(props)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
      />
    </svg>
  )
}
