import { describe, expect, it } from 'vitest'
import { dataQa, dataQaFromProps } from './dataQa'

describe('dataQa', () => {
  it('sets the data-qa HTML attribute', () => {
    expect(dataQa('nav-accounts')).toEqual({ 'data-qa': 'nav-accounts' })
  })

  it('omits the attribute when the id is empty', () => {
    expect(dataQaFromProps(undefined)).toEqual({})
    expect(dataQaFromProps('fab')).toEqual({ 'data-qa': 'fab' })
  })
})
