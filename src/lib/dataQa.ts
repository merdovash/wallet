/**
 * Стабильный селектор для браузерных агентов.
 * В DOM попадает атрибут `data-qa` — искать как `[data-qa="nav-accounts"]`.
 *
 * В JSX: `{...dataQa('nav-accounts')}` или проп `dataQa` у FormControls.
 */
export function dataQa(id: string): { 'data-qa': string } {
  return { 'data-qa': id }
}

export type DataQaProps = {
  /** Стабильный id; рендерится как HTML-атрибут data-qa. */
  dataQa?: string
}

export function dataQaFromProps(dataQaId?: string): { 'data-qa'?: string } {
  return dataQaId ? { 'data-qa': dataQaId } : {}
}
