import { describe, expect, it } from 'vitest'
import { idsEqual, moveId } from './reorderList'

describe('moveId', () => {
  it('moves an id before a later neighbour', () => {
    expect(moveId(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a'])
  })

  it('moves an id toward the start', () => {
    expect(moveId(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
  })

  it('returns the same list when ids are missing or identical', () => {
    expect(moveId(['a', 'b'], 'a', 'a')).toEqual(['a', 'b'])
    expect(moveId(['a', 'b'], 'x', 'a')).toEqual(['a', 'b'])
  })
})

describe('idsEqual', () => {
  it('compares order-sensitive lists', () => {
    expect(idsEqual(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(idsEqual(['a', 'b'], ['b', 'a'])).toBe(false)
  })
})
