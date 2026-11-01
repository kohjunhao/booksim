import { useMemo, useState, type MouseEvent, type TouchEvent } from 'react'
import {
  applyFill,
  impactCurve,
  makeBook,
  postedPrices,
  sideVig,
  walk,
  type Book,
  type Fill,
  type Side,
} from './engine'
import { cents, money, odds, parseStake, pct, shares } from './format'

type EventDef = {
  id: string
  kicker: string
  question: string
  resolve: string
  pYes: number
}

const EVENTS: EventDef[] = [
  {
    id: 'nvda',
    kicker: 'Equity · 31 Dec 2026',
    question: 'Will NVIDIA close 2026 above $200?',
    resolve: 'Official Nasdaq close, 31 December 2026.',
    pYes: 0.6,
  },
  {
    id: 'fed',
    kicker: 'Macro · December FOMC',
    question: 'Will the Fed cut rates at the December 2026 meeting?',
    resolve: 'A cut of 25bp or more. Hold or hike is No.',
    pYes: 0.35,
  },
  {
    id: 'ars',
    kicker: 'Sport · EPL 2026/27',
    question: 'Will Arsenal win the 2026/27 Premier League?',
    resolve: 'Win the title. Not top four.',
    pYes: 0.28,
  },
]

const STAKE_CHIPS = [1_000, 10_000, 50_000, 100_000]
const BASELINE = [
  { v: 0.04, lab: '4%' },
  { v: 0.05, lab: '5%' },
  { v: 0.06, lab: '6%' },
]
const FLOOR = [
  { v: 15_000, lab: '$15k' },
  { v: 25_000, lab: '$25k' },
  { v: 50_000, lab: '$50k' },
]
const TERMINAL = [
  { v: 0.15, lab: '15%' },
  { v: 0.18, lab: '18%' },
  { v: 0.2, lab: '20%' },
]
const CAPS = [
  { v: 25_000, lab: '$25k' },
  { v: 100_000, lab: '$100k' },
  { v: 250_000, lab: '$250k' },
]

type TapeRow = { n: number; clock: string; fill: Fill }

function clock(): string {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

export function App() {
  const [eventId, setEventId] = useState(EVENTS[0].id)
  const event = EVENTS.find((e) => e.id === eventId) ?? EVENTS[0]
  const [book, setBook] = useState<Book>(() => makeBook({ pYes: event.pYes }))
  const [side, setSide] = useState<Side>(0)
  const [stakeRaw, setStakeRaw] = useState('10,000')
  const [tape, setTape] = useState<TapeRow[]>([])
  const [hover, setHover] = useState<number | null>(null)

  const prices = postedPrices(book)
  const juice: [number, number] = [sideVig(book, 0), sideVig(book, 1)]
  const stake = parseStake(stakeRaw)
  const quote = useMemo(() => walk(book, side, stake), [book, side, stake])
  const curve = useMemo(() => impactCurve(book, side), [book, side])
  const overround = prices[0] + prices[1] - 1

  function resetBook(next: Partial<Book> & { pYes?: number }, clearTape = false) {
    setBook((b) => makeBook({ ...b, L: clearTape ? [0, 0] : b.L, ...next }))
    if (clearTape) setTape([])
  }

  function pickEvent(id: string) {
    const ev = EVENTS.find((e) => e.id === id) ?? EVENTS[0]
    setEventId(id)
    setBook((b) => makeBook({ ...b, pYes: ev.pYes, L: [0, 0] }))
    setTape([])
    setSide(0)
  }

  function take() {
    if (quote.filled < 1) return
    const fill = quote
    setBook((b) => applyFill(b, fill))
    setTape((t) => [{ n: t.length + 1, clock: clock(), fill }, ...t])
  }

  function undo() {
    const last = tape[0]
    if (!last) return
    setBook((b) => ({ ...b, L: last.fill.LBefore }))
    setTape((t) => t.slice(1))
  }

  return (
    <div className="shell">
      <header className="mast">
        <div className="brand">SLAM</div>
        <div className="mast-meta">
          <span>
            Max <b>{money(book.M)}</b> / outcome
          </span>
          <span>
            <b>{pct(book.m0)}</b> to {money(book.L0)}
          </span>
          <span>
            <b>{pct(book.m1)}</b> at cap
          </span>
          <span>
            Book <b>{pct(overround)}</b>
          </span>
          <button type="button" className="linkish" onClick={() => resetBook({ pYes: event.pYes }, true)}>
            Reset
          </button>
        </div>
      </header>

      <section className="event">
        <div className="kicker">{event.kicker}</div>
        <h1 className="question">{event.question}</h1>
        <p className="resolve">{event.resolve}</p>
        <div className="events">
          {EVENTS.map((ev) => (
            <button
              key={ev.id}
              type="button"
              className={ev.id === event.id ? 'is-on' : ''}
              onClick={() => pickEvent(ev.id)}
            >
              {ev.id === 'nvda' ? 'NVIDIA' : ev.id === 'fed' ? 'Fed cut' : 'Arsenal'}
            </button>
          ))}
        </div>
      </section>

      <div className="stage">
        <div>
          <div className="board">
            <Outcome
              label="Yes"
              price={prices[0]}
              fair={book.p[0]}
              juice={juice[0]}
              on={side === 0}
              hot={juice[0] > book.m0 + 1e-6}
              onPick={() => setSide(0)}
            />
            <Outcome
              label="No"
              price={prices[1]}
              fair={book.p[1]}
              juice={juice[1]}
              on={side === 1}
              hot={juice[1] > book.m0 + 1e-6}
              onPick={() => setSide(1)}
            />
          </div>
          <p className="hint">
            Juice stays {pct(book.m0)} until {money(book.L0)} of liability on that side, then ramps
            to {pct(book.m1)} at the cap. The other side stays at {pct(book.m0)}.
          </p>
        </div>

        <Ticket
          n={tape.length + 1}
          side={side}
          stakeRaw={stakeRaw}
          onStake={setStakeRaw}
          quote={quote}
          onTake={take}
          onUndo={undo}
          canUndo={tape.length > 0}
        />
      </div>

      <section className="rails" aria-label="Liability">
        <Rail label="Yes" L={book.L[0]} M={book.M} L0={book.L0} kind="yes" />
        <Rail label="No" L={book.L[1]} M={book.M} L0={book.L0} kind="no" />
      </section>

      <section className="curve-block">
        <div className="curve-head">
          <h2>Impact · {side === 0 ? 'Yes' : 'No'}</h2>
          <div className="legend">
            <i className="avg">average fill</i>
            <i className="last">last slice</i>
          </div>
        </div>
        <Curve data={curve} hover={hover} onHover={setHover} />
        <div className="hover-fig">
          {hover != null && curve[hover]
            ? `${money(curve[hover].stake)} walks the board to ${cents(curve[hover].last)} · avg ${cents(curve[hover].avg)}`
            : 'Flat to the floor, then the juice ramps. Size on the x, cents on the y.'}
        </div>
      </section>

      <div className="lower">
        <section className="tape-block">
          <h2>Tape</h2>
          {tape.length === 0 ? (
            <p className="empty">
              Book is empty. Juice is {pct(book.m0)} until {money(book.L0)} of L. A thousand dollars
              does not move {cents(prices[0])}.
            </p>
          ) : (
            <ol className="tape">
              {tape.map((row) => (
                <li key={row.n}>
                  <span className="when">{row.clock}</span>
                  <span className={`side ${row.fill.side === 0 ? 'yes' : 'no'}`}>
                    {row.fill.side === 0 ? 'YES' : 'NO'}
                  </span>
                  <span>
                    {money(row.fill.filled)} · {shares(row.fill.shares)} sh · avg{' '}
                    {cents(row.fill.avgPrice)}
                  </span>
                  <span className="walk">
                    {cents(row.fill.startPrice)} → {cents(row.fill.endPrice)}
                    {row.fill.capped ? ' · cap' : ''}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="clerk">
          <h2>Clerk</h2>
          <div className="knob">
            <label htmlFor="fair">Fair Yes</label>
            <div className="fair">
              <input
                id="fair"
                type="range"
                min={10}
                max={90}
                step={1}
                value={Math.round(book.p[0] * 100)}
                onChange={(e) => resetBook({ pYes: Number(e.target.value) / 100 })}
              />
              <output>{Math.round(book.p[0] * 100)}%</output>
            </div>
          </div>
          <div className="knob">
            <label>Baseline</label>
            <div className="row">
              {BASELINE.map((k) => (
                <button
                  key={k.v}
                  type="button"
                  className={book.m0 === k.v ? 'is-on' : ''}
                  onClick={() => resetBook({ m0: k.v, m1: Math.max(book.m1, k.v) })}
                >
                  {k.lab}
                </button>
              ))}
            </div>
          </div>
          <div className="knob">
            <label>Ramp from</label>
            <div className="row">
              {FLOOR.map((k) => (
                <button
                  key={k.v}
                  type="button"
                  className={book.L0 === k.v ? 'is-on' : ''}
                  onClick={() => resetBook({ L0: k.v })}
                >
                  {k.lab}
                </button>
              ))}
            </div>
          </div>
          <div className="knob">
            <label>At cap</label>
            <div className="row">
              {TERMINAL.map((k) => (
                <button
                  key={k.v}
                  type="button"
                  className={book.m1 === k.v ? 'is-on' : ''}
                  onClick={() => resetBook({ m1: k.v })}
                >
                  {k.lab}
                </button>
              ))}
            </div>
          </div>
          <div className="knob">
            <label>Max risk</label>
            <div className="row">
              {CAPS.map((k) => (
                <button
                  key={k.v}
                  type="button"
                  className={book.M === k.v ? 'is-on' : ''}
                  onClick={() =>
                    setBook((b) =>
                      makeBook({
                        ...b,
                        M: k.v,
                        L: [Math.min(b.L[0], k.v), Math.min(b.L[1], k.v)],
                      }),
                    )
                  }
                >
                  {k.lab}
                </button>
              ))}
            </div>
          </div>
          <p className="notes">
            Posted = fair × (1 + juice). Juice is {pct(book.m0)} until {money(book.L0)} of L on that
            side, then exponential to {pct(book.m1)} at {money(book.M)}. Other side stays at{' '}
            {pct(book.m0)}. Walk in $500 slices.
          </p>
        </section>
      </div>
    </div>
  )
}

function Outcome({
  label,
  price,
  fair,
  juice,
  on,
  hot,
  onPick,
}: {
  label: string
  price: number
  fair: number
  juice: number
  on: boolean
  hot: boolean
  onPick: () => void
}) {
  const whole = Math.floor(price * 100)
  const frac = Math.round(price * 1000) % 10
  return (
    <button
      type="button"
      className={`outcome is-${label.toLowerCase()} ${on ? 'is-on' : ''} ${hot ? 'is-hot' : ''}`}
      onClick={onPick}
      aria-pressed={on}
    >
      <span className="lab">{label}</span>
      <span className="price">
        {whole}
        <span className="unit">.{frac}¢</span>
      </span>
      <span className="under">
        <span>
          fair <strong>{pct(fair)}</strong>
        </span>
        <span>
          juice <strong>{pct(juice)}</strong>
        </span>
        <span>
          dec <strong>{odds(price)}</strong>
        </span>
      </span>
    </button>
  )
}

function Ticket({
  n,
  side,
  stakeRaw,
  onStake,
  quote,
  onTake,
  onUndo,
  canUndo,
}: {
  n: number
  side: Side
  stakeRaw: string
  onStake: (v: string) => void
  quote: Fill
  onTake: () => void
  onUndo: () => void
  canUndo: boolean
}) {
  const name = side === 0 ? 'YES' : 'NO'
  const profit = quote.shares - quote.filled
  return (
    <form
      className="ticket"
      onSubmit={(e) => {
        e.preventDefault()
        onTake()
      }}
    >
      <div className="ticket-head">
        <span>Betting slip</span>
        <span className="no">No. {String(n).padStart(4, '0')}</span>
      </div>
      <div className="side-row">
        <div className={`side-name ${side === 0 ? 'yes' : 'no'}`}>{name}</div>
        <div>{cents(quote.startPrice)}</div>
      </div>
      <label className="field">
        <span>Stake</span>
        <input
          inputMode="decimal"
          autoComplete="off"
          value={stakeRaw}
          onChange={(e) => onStake(e.target.value)}
          aria-label="Stake"
        />
      </label>
      <div className="chips">
        {STAKE_CHIPS.map((v) => (
          <button
            key={v}
            type="button"
            className={`chip ${parseStake(stakeRaw) === v ? 'is-on' : ''}`}
            onClick={() => onStake(v.toLocaleString('en-US'))}
          >
            {money(v)}
          </button>
        ))}
      </div>
      <div className="quote">
        {quote.filled < 1 && quote.requested > 0 ? (
          <div className="warn">No room left on this side.</div>
        ) : (
          <>
            <div className="row">
              <em>Shares</em>
              <span>{shares(quote.shares)} @ {cents(quote.avgPrice)}</span>
            </div>
            <div className="row">
              <em>Walk</em>
              <span>
                {cents(quote.startPrice)} → {cents(quote.endPrice)} · {quote.slices} slices
              </span>
            </div>
            <div className="row">
              <em>Juice</em>
              <span>
                {pct(quote.startVig)} → {pct(quote.endVig)}
              </span>
            </div>
            <div className="row">
              <em>If {name} wins</em>
              <span>+{money(profit)}</span>
            </div>
            <div className="row">
              <em>L after</em>
              <span>
                Yes {money(quote.LAfter[0])} · No {money(quote.LAfter[1])}
              </span>
            </div>
            {quote.capped && (
              <div className="warn">
                Cap. Fills {money(quote.filled)} of {money(quote.requested)}.
              </div>
            )}
          </>
        )}
      </div>
      <button className="take" type="submit" disabled={quote.filled < 1}>
        Take the bet
      </button>
      <div className="ticket-foot">
        <span>Pays $1 a share if {name}</span>
        <button type="button" className="ghost" onClick={onUndo} disabled={!canUndo}>
          Undo
        </button>
      </div>
    </form>
  )
}

function Rail({
  label,
  L,
  M,
  L0,
  kind,
}: {
  label: string
  L: number
  M: number
  L0: number
  kind: 'yes' | 'no'
}) {
  const cushion = L < 0
  const w = cushion ? 0 : Math.min(100, (L / M) * 100)
  const floor = Math.min(100, (L0 / M) * 100)
  return (
    <div className="rail">
      <div className="who">{label}</div>
      <div className="track" aria-hidden="true">
        <div className="floor" style={{ left: `${floor}%` }} />
        <div className={`fill ${kind}`} style={{ width: `${w}%` }} />
      </div>
      <div className={`fig ${cushion ? 'cushion' : ''}`}>
        {cushion ? `${money(L)} cushion` : `${money(L)} / ${money(M)}`}
      </div>
    </div>
  )
}

function Curve({
  data,
  hover,
  onHover,
}: {
  data: { stake: number; avg: number; last: number }[]
  hover: number | null
  onHover: (i: number | null) => void
}) {
  const W = 640
  const H = 200
  const pad = { l: 44, r: 12, t: 10, b: 28 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  if (data.length < 2) {
    return <p className="empty">No room to walk.</p>
  }
  const maxS = data[data.length - 1].stake
  const ys = data.flatMap((d) => [d.avg, d.last])
  const y0 = Math.min(...ys)
  const y1 = Math.max(...ys)
  const span = Math.max(0.04, y1 - y0)
  const x = (s: number) => pad.l + (s / maxS) * innerW
  const y = (p: number) => pad.t + (1 - (p - y0) / span) * innerH
  const avgD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.stake).toFixed(1)} ${y(d.avg).toFixed(1)}`).join(' ')
  const lastD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(d.stake).toFixed(1)} ${y(d.last).toFixed(1)}`).join(' ')

  function at(ev: MouseEvent<SVGSVGElement> | TouchEvent<SVGSVGElement>) {
    const svg = ev.currentTarget
    const clientX = 'touches' in ev ? ev.touches[0]?.clientX : ev.clientX
    if (clientX == null) return
    const rect = svg.getBoundingClientRect()
    const px = ((clientX - rect.left) / rect.width) * W
    let best = 0
    let bestD = Infinity
    data.forEach((d, i) => {
      const dist = Math.abs(x(d.stake) - px)
      if (dist < bestD) {
        bestD = dist
        best = i
      }
    })
    onHover(best)
  }

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Price impact versus stake"
      onMouseMove={at}
      onMouseLeave={() => onHover(null)}
      onTouchStart={at}
      onTouchMove={at}
    >
      <text className="axis" x={pad.l} y={H - 8}>
        {money(0)}
      </text>
      <text className="axis" x={W / 2} y={H - 8} textAnchor="middle">
        {money(maxS / 2)}
      </text>
      <text className="axis" x={W - pad.r} y={H - 8} textAnchor="end">
        {money(maxS)}
      </text>
      <text className="axis" x={4} y={y(y1) + 4}>
        {cents(y1)}
      </text>
      <text className="axis" x={4} y={y(y0) + 4}>
        {cents(y0)}
      </text>
      <path className="last-line" d={lastD} />
      <path className="avg-line" d={avgD} />
      {hover != null && data[hover] && (
        <circle cx={x(data[hover].stake)} cy={y(data[hover].avg)} r={4} fill="oklch(0.82 0.13 78)" />
      )}
    </svg>
  )
}
