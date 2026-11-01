/** Logit-inventory book. Liability cap M per outcome. Fat bets walk the curve. */

export type Side = 0 | 1

export type Book = {
  p: [number, number]
  L: [number, number]
  M: number
  kappa: number
  vig: number
}

export type Slice = {
  stake: number
  odds: number
  price: number
  dL: number
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
  return {
    p: [pYes, 1 - pYes],
    L: partial.L ? [partial.L[0], partial.L[1]] : [0, 0],
    M: partial.M ?? 100_000,
    kappa: partial.kappa ?? 3,
    vig: partial.vig ?? 0.04,
  }
}

export function inventoryQ(book: Book): [number, number] {
  const z0 = Math.log(book.p[0]) + book.kappa * (book.L[0] / book.M)
  const z1 = Math.log(book.p[1]) + book.kappa * (book.L[1] / book.M)
  const peak = Math.max(z0, z1)
  const e0 = Math.exp(z0 - peak)
  const e1 = Math.exp(z1 - peak)
  const s = e0 + e1
  return [e0 / s, e1 / s]
}

export function postedPrices(book: Book): [number, number] {
  const q = inventoryQ(book)
  const m = 1 + book.vig
  return [clamp(q[0] * m, MIN_PRICE, MAX_PRICE), clamp(q[1] * m, MIN_PRICE, MAX_PRICE)]
}

export function walk(book: Book, side: Side, stake: number): Fill {
  const requested = Number.isFinite(stake) && stake > 0 ? stake : 0
  const other: Side = side === 0 ? 1 : 0
  const L: [number, number] = [book.L[0], book.L[1]]
  const LBefore: [number, number] = [L[0], L[1]]
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
  const out: CurvePoint[] = [{ stake: 0, avg: postedPrices(book)[side], last: postedPrices(book)[side] }]
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
