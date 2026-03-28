import { useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
import type { Member, SpEnvelope, FrontContent } from '../types'
import styles from './HeatmapStrip.module.css'

const WINDOW_MS = 24 * 60 * 60 * 1000

interface Span { left: number; width: number }

export default function HeatmapStrip() {
  const navigate = useNavigate()

  // Stable mount-time reference used only for the query's from/to params.
  // This prevents the queryFn from changing on every render while still
  // anchoring the fetch to the correct 24h window.
  const mountRef = useRef(Date.now())

  const { data: history = [] } = useQuery({
    queryKey: ['front-history-24h'],
    queryFn: () => {
      const to = Date.now()
      const from = to - WINDOW_MS
      mountRef.current = to
      return frontApi.historyInRange(
        new Date(from).toISOString(),
        new Date(to).toISOString()
      )
    },
    refetchInterval: 30_000,
  })

  // `now` updates whenever history refetches so ongoing spans aren't truncated
  // over long sessions.
  const now = useMemo(() => mountRef.current, [history]) // eslint-disable-line react-hooks/exhaustive-deps
  const windowStart = now - WINDOW_MS

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  const memberMap = useMemo(
    () => Object.fromEntries((members as Member[]).map(m => [m.id, m])),
    [members]
  )

  const top5 = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const e of history as SpEnvelope<FrontContent>[]) {
      const start = Math.max(e.content.startTime, windowStart)
      const end = e.content.endTime != null ? Math.min(e.content.endTime, now) : now
      if (end > start) {
        totals[e.content.member] = (totals[e.content.member] ?? 0) + (end - start)
      }
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id)
  }, [history, windowStart, now])

  const spansByMember = useMemo(() => {
    const result: Record<string, Span[]> = {}
    for (const e of history as SpEnvelope<FrontContent>[]) {
      const id = e.content.member
      if (!top5.includes(id)) continue
      const clampedStart = Math.max(e.content.startTime, windowStart)
      const clampedEnd = e.content.endTime != null ? Math.min(e.content.endTime, now) : now
      if (clampedEnd <= clampedStart) continue
      const left = (clampedStart - windowStart) / WINDOW_MS * 100
      const width = (clampedEnd - clampedStart) / WINDOW_MS * 100
      result[id] = [...(result[id] ?? []), { left, width }]
    }
    return result
  }, [history, top5, windowStart, now])

  return (
    <div className={styles.strip}>
      <div className={styles.header}>
        <span className={styles.label}>Last 24h</span>
        <button
          className={styles.fullLink}
          onClick={() => navigate('/logs?tab=heatmap')}
          aria-label="Full view"
        >
          Full view →
        </button>
      </div>
      <div className={styles.axis}>
        {['-24h', '-18h', '-12h', '-6h', 'now'].map(l => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {top5.length === 0 ? (
        <p className={styles.empty}>No front activity in the last 24h.</p>
      ) : (
        <div className={styles.rows}>
          {top5.map(memberId => {
            const member = memberMap[memberId]
            const color = member?.color ?? 'var(--color-primary)'
            return (
              <div key={memberId} className={styles.row}>
                <div className={styles.dot} style={{ background: color }} />
                <div className={styles.track}>
                  {(spansByMember[memberId] ?? []).map((s, i) => (
                    <div
                      key={i}
                      className={styles.span}
                      style={{ '--span-color': color, left: `${s.left}%`, width: `${s.width}%` } as React.CSSProperties}
                    >
                      <div className={styles.spanFill} />
                      <div className={styles.spanBar} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
