export function money(n: number, digits = 0): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}m`
  if (abs >= 10_000) return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
  if (abs >= 1000) return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: digits })}`
  return `${sign}$${abs.toFixed(digits)}`
}

export function cents(p: number): string {
  return `${(p * 100).toFixed(1)}¢`
}

export function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`
}

export function odds(price: number): string {
  if (price <= 0) return '—'
  return (1 / price).toFixed(2)
}

export function parseStake(raw: string): number {
  const t = raw.trim().toLowerCase().replace(/[$,\s]/g, '')
  if (!t) return 0
  const mul = t.endsWith('m') ? 1_000_000 : t.endsWith('k') ? 1_000 : 1
  const core = mul === 1 ? t : t.slice(0, -1)
  const n = Number(core)
  return Number.isFinite(n) ? n * mul : 0
}

export function shares(n: number): string {
  if (n >= 10_000) return Math.round(n).toLocaleString('en-US')
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}
