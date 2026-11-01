import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyFill, makeBook, postedPrices, vigForLiability, walk } from './engine.ts'

test('empty 60/40 book posts 63.0¢ / 42.0¢ at 5% juice', () => {
  const book = makeBook({ pYes: 0.6 })
  const [yes, no] = postedPrices(book)
  assert.ok(Math.abs(yes - 0.63) < 1e-12)
  assert.ok(Math.abs(no - 0.42) < 1e-12)
  assert.equal(vigForLiability(book, 0), 0.05)
  assert.equal(vigForLiability(book, 25_000), 0.05)
})

test('juice is flat to $25k of L, then exponential to 18% at the cap', () => {
  const book = makeBook()
  assert.ok(Math.abs(vigForLiability(book, 25_000) - 0.05) < 1e-12)
  const mid = vigForLiability(book, 62_500)
  const expect = 0.05 * (0.18 / 0.05) ** 0.5
  assert.ok(Math.abs(mid - expect) < 1e-12, `mid ${mid} expect ${expect}`)
  assert.ok(Math.abs(vigForLiability(book, 100_000) - 0.18) < 1e-12)
})

test('a thousand dollars does not move the tote under the floor', () => {
  const book = makeBook({ pYes: 0.6 })
  const fill = walk(book, 0, 1_000)
  assert.equal(fill.capped, false)
  assert.ok(fill.filled > 999)
  assert.ok(Math.abs(fill.endPrice - fill.startPrice) < 1e-12)
  assert.ok(fill.LAfter[0] > 0)
  assert.ok(fill.LAfter[0] < 25_000)
  assert.equal(fill.endVig, 0.05)
})

test('size that pushes L through $25k ramps Yes juice; No stays at 5%', () => {
  const book = makeBook({ pYes: 0.6 })
  const fill = walk(book, 0, 80_000)
  assert.equal(fill.capped, false)
  assert.ok(fill.LAfter[0] > 25_000)
  assert.ok(fill.endVig > 0.05)
  assert.ok(fill.endPrice > fill.startPrice)
  const after = applyFill(book, fill)
  const [yes, no] = postedPrices(after)
  assert.ok(yes > 0.63)
  assert.ok(Math.abs(no - 0.42) < 1e-12)
})

test('buying the other side heals Yes liability and juice; No stays 42¢', () => {
  let book = makeBook({ pYes: 0.6 })
  book = applyFill(book, walk(book, 0, 80_000))
  const yesBefore = postedPrices(book)[0]
  const LBefore = book.L[0]
  assert.ok(Math.abs(postedPrices(book)[1] - 0.42) < 1e-12)
  book = applyFill(book, walk(book, 1, 40_000))
  assert.ok(book.L[0] < LBefore)
  assert.ok(postedPrices(book)[0] < yesBefore)
  assert.ok(Math.abs(postedPrices(book)[1] - 0.42) < 1e-12)
})

test('the book refuses size that would push L through $100k', () => {
  const fill = walk(makeBook({ pYes: 0.6 }), 0, 5_000_000)
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
