/** Y-axis domain from data min/max with padding — does not force zero. */
export function paddedDataDomain([dataMin, dataMax]: [number, number]): [number, number] {
  const min = Number.isFinite(dataMin) ? dataMin : 0
  const max = Number.isFinite(dataMax) ? dataMax : 0
  if (min === max) {
    const pad = Math.max(Math.abs(min) * 0.15, 1)
    return [min - pad, max + pad]
  }
  const pad = (max - min) * 0.12
  return [min - pad, max + pad]
}
