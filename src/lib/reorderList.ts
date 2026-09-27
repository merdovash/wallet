/** Move `fromId` to the current position of `overId`. */
export function moveId(ids: string[], fromId: string, overId: string): string[] {
  const from = ids.indexOf(fromId)
  const over = ids.indexOf(overId)
  if (from < 0 || over < 0 || from === over) return ids
  const next = [...ids]
  const [item] = next.splice(from, 1)
  next.splice(over, 0, item!)
  return next
}

export function idsEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}
