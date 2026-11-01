import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const url = process.env.URL || 'http://127.0.0.1:4173/'
const out = '/tmp/booksim-verify'
await mkdir(out, { recursive: true })

const browser = await chromium.launch({ headless: true })
const errors = []

function grabCents(text) {
  const m = [...text.matchAll(/(\d+)\.(\d)¢/g)].map((x) => Number(x[1] + '.' + x[2]))
  return m
}

async function run(name, viewport) {
  const page = await browser.newPage({ viewport })
  page.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.question')

  const question = await page.locator('.question').innerText()
  if (!question.includes('NVIDIA')) errors.push(`${name}: missing NVIDIA question`)

  const board = await page.locator('.board').innerText()
  const cents0 = grabCents(board)
  if (cents0[0] < 62.5 || cents0[0] > 63.5) errors.push(`${name}: Yes not ~63.0¢, got ${cents0[0]}`)
  if (cents0[1] < 41.5 || cents0[1] > 42.5) errors.push(`${name}: No not ~42.0¢, got ${cents0[1]}`)

  await page.screenshot({ path: `${out}/${name}-empty.png`, fullPage: true })

  await page.locator('.chip', { hasText: '$1,000' }).click()
  await page.locator('.take').click()
  await page.waitForTimeout(80)
  const after1k = grabCents(await page.locator('.board').innerText())
  const d1 = after1k[0] - cents0[0]
  if (d1 !== 0) errors.push(`${name}: $1k should not move Yes under the floor, delta ${d1}`)

  await page.locator('.chip', { hasText: '$100,000' }).click()
  await page.locator('.take').click()
  await page.waitForTimeout(80)
  const afterBig = grabCents(await page.locator('.board').innerText())
  if (afterBig[0] <= after1k[0]) {
    errors.push(`${name}: $100k should lift Yes juice, ${after1k[0]} -> ${afterBig[0]}`)
  }
  if (afterBig[1] !== cents0[1]) {
    errors.push(`${name}: No should stay at baseline, ${cents0[1]} -> ${afterBig[1]}`)
  }

  await page.screenshot({ path: `${out}/${name}-slammed.png`, fullPage: true })

  const yesL = await page.locator('.rail').nth(0).innerText()
  if (!yesL.includes('$')) errors.push(`${name}: Yes rail missing money`)

  await page.locator('.outcome.is-no').click()
  await page.locator('.chip', { hasText: '$50,000' }).click()
  await page.locator('.take').click()
  await page.waitForTimeout(80)
  const healed = grabCents(await page.locator('.board').innerText())
  if (healed[0] >= afterBig[0]) errors.push(`${name}: buying No should heal Yes, ${afterBig[0]} -> ${healed[0]}`)

  await page.locator('.outcome.is-yes').click()
  await page.locator('input[aria-label="Stake"]').fill('5000000')
  await page.locator('.take').click()
  await page.waitForTimeout(80)
  const tape = await page.locator('.tape').innerText()
  if (!tape.toLowerCase().includes('cap')) errors.push(`${name}: $5m should print cap on tape`)

  await page.getByRole('button', { name: 'Fed cut' }).click()
  await page.waitForTimeout(80)
  const fedQ = await page.locator('.question').innerText()
  if (!fedQ.includes('Fed')) errors.push(`${name}: event switch failed`)

  await page.getByRole('button', { name: 'Arsenal' }).click()
  await page.waitForTimeout(80)

  await page.screenshot({ path: `${out}/${name}-arsenal.png`, fullPage: true })
  await page.close()
}

await run('desktop', { width: 1280, height: 900 })
await run('mobile', { width: 390, height: 844 })

await browser.close()

if (errors.length) {
  console.error('FAIL')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}
console.log('PASS')
console.log(out)
