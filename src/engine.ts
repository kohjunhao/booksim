/** Size-dependent vig on own-side liability. Other side stays at baseline. */

export type Side = 0 | 1

export type Book = {
  p: [number, number]
  L: [number, number]
  M: number
  m0: number
  m1: number
  L0: number
}

export type Fill = {
  side: Side
  requested: number
  filled: number
  unfilled: number
  payout: number
  shares: number
  avgPrice: number
  startPrice: number
  endPrice: number
  startVig: number
  endVig: number
  ticketOdds: number
  slices: number
  LBefore: [number, number]
  LAfter: [number, number]
  capped: boolean
}

export const SLICE = 500
export const MAX_PRICE = 0.99
export const MIN_PRICE = 0.01

export function makeBook(partial: Partial<Book> & { pYes?: number } = {}): Book {
  const pYes = clamp(partial.pYes ?? partial.p?.[0] ?? 0.6, 0.02, 0.98)
  const M = partial.M ?? 100_000
  const m0 = partial.m0 ?? 0.05
  const m1 = Math.max(partial.m1 ?? 0.18, m0)
  const L0 = clamp(partial.L0 ?? 25_000, 0, Math.max(0, M - 1))
  return {
    p: [pYes, 1 - pYes],
    L: partial.L ? [partial.L[0], partial.L[1]] : [0, 0],
    M,
    m0,
    m1,
    L0,
  }
}

export function vigForLiability(book: Book, L: number): number {
  if (!(L > book.L0)) return book.m0
  const m0 = Math.max(book.m0, 1e-6)
  const m1 = Math.max(book.m1, m0)
  if (L >= book.M) return m1
  const span = book.M - book.L0
  if (span <= 1e-9) return m1
  const t = (L - book.L0) / span
  return m0 * (m1 / m0) ** t
}

export function sideVig(book: Book, side: Side): number {
  return vigForLiability(book, book.L[side])
}

export function postedPrices(book: Book): [number, number] {
  return [
    clamp(book.p[0] * (1 + vigForLiability(book, book.L[0])), MIN_PRICE, MAX_PRICE),
    clamp(book.p[1] * (1 + vigForLiability(book, book.L[1])), MIN_PRICE, MAX_PRICE),
  ]
}

export function walk(book: Book, side: Side, stake: number): Fill {
  const requested = Number.isFinite(stake) && stake > 0 ? stake : 0
  const other: Side = side === 0 ? 1 : 0
  const L: [number, number] = [book.L[0], book.L[1]]
  const LBefore: [number, number] = [L[0], L[1]]
  const startVig = vigForLiability(book, L[side])
  const startPrice = postedPrices({ ...book, L })[side]

  let remaining = requested
  let payout = 0
  let slices = 0
  let lastPrice = startPrice
  const shadow: Book = { ...book, L }

  while (remaining > 0.005) {
    const price = postedPrices(shadow)[side]
    if (price >= MAX_PRICE - 1e-9) break
    const odds = 1 / price
    const edge = odds - 1
    if (edge <= 1e-9) break
    const roomL = book.M - L[side]
    if (roomL <= 0.01) break
    const roomStake = roomL / edge
    if (roomStake <= 0.01) break
    const ds = Math.min(SLICE, remaining, roomStake)
    if (ds <= 0.01) break
    L[side] += ds * edge
    L[other] -= ds
    shadow.L = L
    payout += ds * odds
    remaining -= ds
    lastPrice = price
    slices += 1
    if (slices > 20_000) break
  }

  const filled = requested - remaining
  const shares = payout
  const avgPrice = shares > 0 ? filled / shares : startPrice
  const ticketOdds = filled > 0 ? payout / filled : 1 / startPrice

  return {
    side,
    requested,
    filled,
    unfilled: Math.max(0, remaining),
    payout,
    shares,
    avgPrice,
    startPrice,
    endPrice: lastPrice,
    startVig,
    endVig: vigForLiability({ ...book, L }, L[side]),
    ticketOdds,
    slices,
    LBefore,
    LAfter: [L[0], L[1]],
    capped: remaining > 0.5,
  }
}

export function applyFill(book: Book, fill: Fill): Book {
  return { ...book, L: [fill.LAfter[0], fill.LAfter[1]] }
}

export function maxFillable(book: Book, side: Side): number {
  return walk(book, side, 1e12).filled
}

export type CurvePoint = {
  stake: number
  avg: number
  last: number
}

export function impactCurve(book: Book, side: Side, n = 36): CurvePoint[] {
  const cap = maxFillable(book, side)
  if (cap < 1) return []
  const board = postedPrices(book)[side]
  const out: CurvePoint[] = [{ stake: 0, avg: board, last: board }]
  for (let i = 1; i <= n; i++) {
    const fill = walk(book, side, (cap * i) / n)
    if (fill.filled < 1) continue
    out.push({ stake: fill.filled, avg: fill.avgPrice, last: fill.endPrice })
  }
  return out
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}
