import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { frontApi } from '../../api/front'
import Drawer from '../Drawer'
import type { Member, SpEnvelope, FrontContent, FrontUpdatePayload } from '../../types'
import styles from './LogsTab.module.css'

interface Props {
  member: Member
}

const PAGE_SIZE = 20

function msToDatetimeLocal(ms: number) { return new Date(ms).toISOString().slice(0, 16) }
function datetimeLocalToMs(v: string) { return new Date(v).getTime() }
function formatDuration(s: number, e: number) {
  const mins = Math.round((e - s) / 60000)
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function formatDate(ms: number) { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function formatTime(ms: number) { return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) }

export default function LogsTab({ member }: Props) {
  const qc = useQueryClient()
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<SpEnvelope<FrontContent> | null>(null)
  const [startVal, setStartVal] = useState('')
  const [endVal, setEndVal] = useState('')
  const [statusVal, setStatusVal] = useState('')
  const [commentVal, setCommentVal] = useState('')
  const [drawerError, setDrawerError] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['front-history'],
    queryFn: frontApi.history,
  })

  const updateMutation = useMutation({
    mutationFn: ({ uid, payload }: { uid: string; payload: FrontUpdatePayload }) =>
      frontApi.update(uid, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['front-history'] })
      setSelected(null)
    },
    onError: (e: Error) => setDrawerError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (uid: string) => frontApi.delete(uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['front-history'] })
      setSelected(null)
    },
    onError: (e: Error) => setDrawerError(e.message),
  })

  function openDrawer(entry: SpEnvelope<FrontContent>) {
    setSelected(entry)
    setStartVal(msToDatetimeLocal(entry.content.startTime))
    setEndVal(entry.content.endTime ? msToDatetimeLocal(entry.content.endTime) : '')
    setStatusVal(entry.content.customStatus ?? '')
    setCommentVal(entry.content.comment ?? '')
    setDrawerError('')
  }

  function handleSave() {
    if (!selected) return
    const payload: FrontUpdatePayload = {
      startTime: datetimeLocalToMs(startVal),
      endTime: endVal ? datetimeLocalToMs(endVal) : undefined,
      customStatus: statusVal || undefined,
      comment: commentVal || undefined,
    }
    updateMutation.mutate({ uid: selected.content.uid, payload })
  }

  function handleDelete() {
    if (!selected) return
    if (!window.confirm('Delete this front history entry?')) return
    deleteMutation.mutate(selected.content.uid)
  }

  if (isLoading) return <div role="status" className={styles.container}>Loading…</div>
  if (isError) return (
    <div className={styles.error}>
      Failed to load history
      <br />
      <button className={styles.retryBtn} onClick={() => refetch()}>Retry</button>
    </div>
  )

  const entries = (data ?? [])
    .filter(e => e.content.member === member.id)
    .sort((a, b) => b.content.startTime - a.content.startTime)

  const shown = entries.slice(0, visible)

  return (
    <div className={styles.container}>
      {entries.length === 0 && (
        <p className={styles.empty}>No switches logged for this alter yet.</p>
      )}

      {shown.map(entry => {
        const c = entry.content
        return (
          <div key={c.uid} className={styles.card} onClick={() => openDrawer(entry)}>
            <div className={styles.cardTop}>
              <span className={styles.date}>{formatDate(c.startTime)}</span>
              {!c.live && c.endTime && (
                <span className={styles.duration}>{formatDuration(c.startTime, c.endTime)}</span>
              )}
            </div>
            <div className={styles.timeRange}>
              {formatTime(c.startTime)} – {c.live ? 'ongoing' : c.endTime ? formatTime(c.endTime) : '?'}
            </div>
            {c.customStatus && <div className={styles.status}>{c.customStatus}</div>}
            {c.comment && (
              <div className={styles.commentIndicator}>
                <MessageCircle size={11} />
                <span className={styles.commentPreview}>{c.comment}</span>
              </div>
            )}
          </div>
        )
      })}

      {entries.length > visible && (
        <button className={styles.loadMore} onClick={() => setVisible(v => v + PAGE_SIZE)}>
          Load more
        </button>
      )}

      <Drawer
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? formatDate(selected.content.startTime) : ''}
      >
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Start time</span>
          <input type="datetime-local" className={styles.input} value={startVal} onChange={e => setStartVal(e.target.value)} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>End time</span>
          <input
            type="datetime-local"
            className={styles.input}
            value={endVal}
            onChange={e => setEndVal(e.target.value)}
            disabled={selected?.content.live ?? false}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Status</span>
          <input type="text" className={styles.input} value={statusVal} onChange={e => setStatusVal(e.target.value)} placeholder="Optional" />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Note</span>
          <textarea
            className={styles.input}
            value={commentVal}
            onChange={e => setCommentVal(e.target.value)}
            placeholder="Optional note"
            rows={2}
            style={{ resize: 'vertical' }}
          />
        </div>
        {drawerError && <p className={styles.drawerError}>{drawerError}</p>}
        <div className={styles.drawerActions}>
          <button className={styles.deleteBtn} onClick={handleDelete}>Delete</button>
          <button className={styles.saveBtn} onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Drawer>
    </div>
  )
}
