import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyFill, inventoryQ, makeBook, postedPrices, walk } from './engine.ts'

test('empty 60/40 book posts 62.4¢ / 41.6¢ (1.60 / 2.40)', () => {
  const book = makeBook({ pYes: 0.6, vig: 0.04 })
  const [yes, no] = postedPrices(book)
  assert.ok(Math.abs(yes - 0.624) < 1e-9)
  assert.ok(Math.abs(no - 0.416) < 1e-9)
  assert.ok(Math.abs(1 / yes - 1.602564) < 1e-4)
  assert.ok(Math.abs(1 / no - 2.403846) < 1e-4)
  const q = inventoryQ(book)
  assert.ok(Math.abs(q[0] - 0.6) < 1e-12)
})

test('a thousand dollars barely walks the tote', () => {
  const book = makeBook({ pYes: 0.6 })
  const fill = walk(book, 0, 1_000)
  assert.equal(fill.capped, false)
  assert.ok(fill.filled > 999)
  assert.ok(fill.endPrice - fill.startPrice < 0.01)
  assert.ok(fill.LAfter[0] > 0)
  assert.ok(fill.LAfter[1] < 0)
})

test('fifty thousand on Yes slams the price up', () => {
  const book = makeBook({ pYes: 0.6, kappa: 3 })
  const fill = walk(book, 0, 50_000)
  assert.equal(fill.capped, false)
  assert.ok(fill.endPrice > fill.startPrice + 0.15, `end ${fill.endPrice} start ${fill.startPrice}`)
  assert.ok(fill.avgPrice > fill.startPrice)
  assert.ok(fill.avgPrice < fill.endPrice || fill.slices === 1)
  assert.ok(fill.LAfter[0] < 100_000)
})

test('buying the other side heals Yes liability', () => {
  let book = makeBook({ pYes: 0.6 })
  const slam = walk(book, 0, 40_000)
  book = applyFill(book, slam)
  const yesBefore = postedPrices(book)[0]
  const LBefore = book.L[0]
  const heal = walk(book, 1, 20_000)
  book = applyFill(book, heal)
  assert.ok(book.L[0] < LBefore)
  assert.ok(postedPrices(book)[0] < yesBefore)
})

test('the book refuses size that would push L through $100k', () => {
  const book = makeBook({ pYes: 0.6, M: 100_000 })
  const fill = walk(book, 0, 5_000_000)
  assert.equal(fill.capped, true)
  assert.ok(fill.filled > 0)
  assert.ok(fill.LAfter[0] <= 100_000 + 1e-6)
  assert.ok(fill.unfilled > 1_000)
})

test('shares pay $1: payout equals shares, cost is filled stake', () => {
  const fill = walk(makeBook({ pYes: 0.6 }), 0, 10_000)
  assert.ok(Math.abs(fill.shares - fill.payout) < 1e-9)
  assert.ok(Math.abs(fill.avgPrice * fill.shares - fill.filled) < 1e-6)
  const profitIfWin = fill.shares - fill.filled
  assert.ok(Math.abs(profitIfWin - (fill.LAfter[0] - fill.LBefore[0])) < 1e-6)
})
