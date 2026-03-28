import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
import type { Member, SpEnvelope, FrontContent } from '../types'
import styles from './FrontHeatmap.module.css'

type TimeRange = '24h' | '7d' | '30d'

const RANGE_MS: Record<TimeRange, number> = {
  '24h':  24 * 60 * 60 * 1000,
  '7d':    7 * 24 * 60 * 60 * 1000,
  '30d':  30 * 24 * 60 * 60 * 1000,
}

function axisLabels(windowMs: number, now: number): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map(t => {
    if (t === 1) return 'now'
    const ts = new Date(now - windowMs * (1 - t))
    return windowMs <= 24 * 3600 * 1000
      ? ts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  })
}

interface Span { left: number; width: number }

export default function FrontHeatmap() {
  const [range, setRange] = useState<TimeRange>('24h')
  const windowMs = RANGE_MS[range]
  const now = useMemo(() => Date.now(), [range])
  const windowStart = now - windowMs

  const { data: history = [] } = useQuery({
    queryKey: ['front-history-range', range],
    queryFn: () => frontApi.historyInRange(
      new Date(windowStart).toISOString(),
      new Date(now).toISOString()
    ),
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  const memberList = members as Member[]

  const { activeMemberIds, inactiveMemberIds } = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const e of history as SpEnvelope<FrontContent>[]) {
      const start = Math.max(e.content.startTime, windowStart)
      const end = e.content.endTime != null ? Math.min(e.content.endTime, now) : now
      if (end > start) {
        totals[e.content.member] = (totals[e.content.member] ?? 0) + (end - start)
      }
    }
    const activeSet = new Set(Object.keys(totals))
    const activeMemberIds = memberList
      .filter(m => activeSet.has(m.id))
      .sort((a, b) => (totals[b.id] ?? 0) - (totals[a.id] ?? 0))
      .map(m => m.id)
    const inactiveMemberIds = memberList
      .filter(m => !activeSet.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => m.id)
    return { activeMemberIds, inactiveMemberIds }
  }, [history, memberList, windowStart, now])

  const spansByMember = useMemo(() => {
    const result: Record<string, Span[]> = {}
    for (const e of history as SpEnvelope<FrontContent>[]) {
      const id = e.content.member
      const clampedStart = Math.max(e.content.startTime, windowStart)
      const clampedEnd = e.content.endTime != null ? Math.min(e.content.endTime, now) : now
      if (clampedEnd <= clampedStart) continue
      const left = (clampedStart - windowStart) / windowMs * 100
      const width = (clampedEnd - clampedStart) / windowMs * 100
      result[id] = [...(result[id] ?? []), { left, width }]
    }
    return result
  }, [history, windowStart, now, windowMs])

  const memberMap = useMemo(
    () => Object.fromEntries(memberList.map(m => [m.id, m])),
    [memberList]
  )

  const labels = useMemo(() => axisLabels(windowMs, now), [windowMs, now])
  const allEmpty = activeMemberIds.length === 0

  function renderRow(memberId: string, dimmed = false) {
    const member = memberMap[memberId]
    const color = member?.color ?? 'var(--color-primary)'
    return (
      <div key={memberId} className={`${styles.row} ${dimmed ? styles.dimmed : ''}`}>
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
  }

  return (
    <div className={styles.heatmap}>
      <div className={styles.toggle}>
        {(['24h', '7d', '30d'] as TimeRange[]).map(r => (
          <button
            key={r}
            className={`${styles.rangeBtn} ${range === r ? styles.active : ''}`}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      <div className={styles.axis}>
        {labels.map(l => <span key={l}>{l}</span>)}
      </div>

      {allEmpty ? (
        <p className={styles.empty}>No front activity in the last {range}.</p>
      ) : (
        <div className={styles.rows}>
          {activeMemberIds.map(id => renderRow(id, false))}
          {inactiveMemberIds.map(id => renderRow(id, true))}
        </div>
      )}
    </div>
  )
}
