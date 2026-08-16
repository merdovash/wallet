import type { AnalyticsSection, AppSection } from '../types/wallet'

/** Основные пункты меню (нижняя панель и верх сайдбара). */
export const PRIMARY_NAV_SECTIONS: AppSection[] = [
  'dashboard',
  'checkins',
  'accounts',
  'analytics',
  'settings',
]

export const ANALYTICS_NAV_ITEMS: {
  id: AnalyticsSection
  label: string
  description: string
}[] = [
  {
    id: 'daily',
    label: 'По дням',
    description: 'Столбцы прироста за каждый день между чек-инами',
  },
  {
    id: 'types',
    label: 'По типам',
    description: 'Сводка по видам счетов и годовой прирост групп',
  },
  {
    id: 'currencies',
    label: 'Валюты',
    description: 'Курсовая разница и динамика иностранных позиций',
  },
  {
    id: 'monthly',
    label: 'Помесячно',
    description: 'Месячный прирост, годовые и риск-метрики',
  },
  {
    id: 'float',
    label: 'Float',
    description: 'Выгода от беспроцентного кредита на связанном счёте',
  },
  {
    id: 'cashback',
    label: 'Кэшбек',
    description: 'Скидка от расходов через кэшбек-счета',
  },
]

export const ANALYTICS_SECTION_IDS = new Set<AppSection>(
  ANALYTICS_NAV_ITEMS.map((item) => item.id),
)

export function isAnalyticsSection(section: AppSection): section is AnalyticsSection {
  return ANALYTICS_SECTION_IDS.has(section)
}

/** В основном меню активен хаб, если открыт он или любой отчёт внутри. */
export function primaryNavActiveId(section: AppSection): AppSection {
  if (isAnalyticsSection(section)) return 'analytics'
  return section
}
