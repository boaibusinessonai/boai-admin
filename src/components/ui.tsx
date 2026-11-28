import { AlertTriangle, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

// Small building blocks shared by the admin pages.

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="muted loading" role="status"><Loader2 size={16} className="spin" aria-hidden="true" /> {label}</p>
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <AlertTriangle size={16} aria-hidden="true" /> <span>{message}</span>
      {onRetry && <button type="button" className="text-button" onClick={onRetry}>Try again</button>}
    </div>
  )
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && <header className="card-head">{title && <h2>{title}</h2>}{action}</header>}
      {children}
    </section>
  )
}

/** A headline number with what it means underneath. */
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'good' | 'warning' | 'critical' | 'accent'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

/** Horizontal bars for a ranked list (one series): label, bar, value. */
export function BarList({ rows, format = String, label }: { rows: { label: string; value: number }[]; format?: (value: number) => string; label: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  if (!rows.length) return <p className="muted">Nothing yet.</p>
  return (
    <ul className="bar-list" aria-label={label}>
      {rows.map((row) => (
        <li key={row.label} title={`${row.label}: ${format(row.value)}`}>
          <span className="bar-label">{row.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(row.value > 0 ? 2 : 0, (row.value / max) * 100)}%` }} /></span>
          <span className="bar-value">{format(row.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Vertical bars over time (one series), with a tooltip on each bar and the total in the title. */
export function ColumnChart({ points, format = String, label }: { points: { label: string; value: number }[]; format?: (value: number) => string; label: string }) {
  const max = Math.max(1, ...points.map((point) => point.value))
  const [hover, setHover] = useState<number | null>(null)
  return (
    <figure className="columns" aria-label={label}>
      <div className="columns-plot" onMouseLeave={() => setHover(null)}>
        {points.map((point, index) => (
          <button type="button" key={point.label} className={`column ${hover === index ? 'is-hover' : ''}`} onMouseEnter={() => setHover(index)} onFocus={() => setHover(index)}
            aria-label={`${point.label}: ${format(point.value)}`}>
            <span className="column-fill" style={{ height: `${point.value > 0 ? Math.max(3, (point.value / max) * 100) : 0}%` }} />
          </button>
        ))}
        {hover !== null && points[hover] && (
          <span className="column-tip" style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}>{points[hover].label}<strong>{format(points[hover].value)}</strong></span>
        )}
      </div>
      <figcaption className="columns-axis"><span>{points[0]?.label}</span><span>max {format(max)}</span><span>{points[points.length - 1]?.label}</span></figcaption>
    </figure>
  )
}

/** A short line of facts: label and value pairs. */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value ?? '—'}</dd></div>)}
    </dl>
  )
}

/** A form that opens further down the page: brings it into view, so opening it can't look like nothing happened. */
export function OpensInView({ children }: { children: ReactNode }) {
  const here = useRef<HTMLDivElement>(null)
  useEffect(() => { here.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [])
  return <div ref={here}>{children}</div>
}
