import { useState, useEffect } from 'react'
import type { FrontContent, Member } from '../types'
import Avatar from './Avatar'
import StatusPickerSheet from './StatusPickerSheet'
import { useReducedMotion } from '../hooks/useReducedMotion'
import type { FrontStatus } from '../api/frontStatuses'
import styles from './FrontCard.module.css'

interface FrontCardProps {
  entry: FrontContent
  member: Member
  frontStatuses: FrontStatus[]
  onRemove: (uid: string) => void
  onUpdateStatus: (uid: string, status: string) => void
  onEdit: (uid: string, memberId: string, startTime: number) => void
  onUpdateComment?: (uid: string, comment: string) => void
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function FrontCard({ entry, member, frontStatuses, onRemove, onUpdateStatus, onEdit, onUpdateComment }: FrontCardProps) {
  const reduced = useReducedMotion()
  const [collapsed, setCollapsed] = useState(false)
  const [elapsed, setElapsed] = useState(Date.now() - entry.startTime)
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [status, setStatus] = useState(entry.customStatus ?? '')
  const [comment, setComment] = useState(entry.comment ?? '')
  const [showEdit, setShowEdit] = useState(false)
  const [editMemberId, setEditMemberId] = useState(entry.member)
  const [editStartTime, setEditStartTime] = useState(
    new Date(entry.startTime).toISOString().slice(0, 16)
  )

  useEffect(() => {
    setStatus(entry.customStatus ?? '')
    setEditMemberId(entry.member)
    setEditStartTime(new Date(entry.startTime).toISOString().slice(0, 16))
    setComment(entry.comment ?? '')
  }, [entry.uid, entry.customStatus, entry.member, entry.startTime, entry.comment])

  useEffect(() => {
    if (reduced) return
    const id = setInterval(() => setElapsed(Date.now() - entry.startTime), 1000)
    return () => clearInterval(id)
  }, [entry.startTime, reduced])

  const handleEditSave = () => {
    onEdit(entry.uid, editMemberId, new Date(editStartTime).getTime())
    setShowEdit(false)
  }

  const currentStatusColor = frontStatuses.find(s => s.label === status)?.color ?? 'var(--color-muted)'

  const startDisplay = new Date(entry.startTime).toLocaleString([], {
    hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric',
  })

  return (
    <div className={styles.card} data-member style={{ '--member-color': member.color } as React.CSSProperties}>
      {/* Header — tap to collapse */}
      <div
        className={styles.header}
        data-testid="card-header"
        onClick={() => setCollapsed(c => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <Avatar
          name={member.name}
          color={member.color ?? '#888'}
          avatarPath={member.avatarPath}
          isFronting
        />
        <div className={styles.headerInfo}>
          <span className={styles.name}>{member.name}</span>
          {!collapsed && member.pronouns && (
            <span className={styles.pronouns}>{member.pronouns}</span>
          )}
        </div>
        <span
          className={styles.timer}
          data-testid="live-timer"
          style={reduced ? { display: 'none' } : undefined}
        >
          {formatDuration(elapsed)}
        </span>
      </div>

      {!collapsed && (
        <div className={styles.body}>
          <div className={styles.startTime}>Started {startDisplay}</div>

          {/* Status */}
          <div className={styles.statusRow}>
            <button
              className={styles.statusTap}
              onClick={() => setShowStatusSheet(true)}
              aria-label="Edit status"
            >
              {status ? (
                <>
                  <span className={styles.statusDot} style={{ background: currentStatusColor }} />
                  {status}
                </>
              ) : (
                <span className={styles.placeholder}>Set a status…</span>
              )}
            </button>
          </div>

          <StatusPickerSheet
            isOpen={showStatusSheet}
            currentStatus={status}
            statuses={frontStatuses}
            onSelect={value => {
              setStatus(value)
              onUpdateStatus(entry.uid, value)
            }}
            onClose={() => setShowStatusSheet(false)}
          />

          {/* Edit form */}
          {showEdit && (
            <div className={styles.editForm}>
              <label className={styles.editLabel}>
                Member ID
                <input
                  className={styles.editInput}
                  value={editMemberId}
                  onChange={e => setEditMemberId(e.target.value)}
                />
              </label>
              <label className={styles.editLabel}>
                Start time
                <input
                  type="datetime-local"
                  className={styles.editInput}
                  value={editStartTime}
                  onChange={e => setEditStartTime(e.target.value)}
                />
              </label>
              <div className={styles.editActions}>
                <button className={styles.saveBtn} onClick={handleEditSave}>Save</button>
                <button className={styles.cancelBtn} onClick={() => setShowEdit(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Comment */}
          <div className={styles.commentRow}>
            <textarea
              className={styles.commentInput}
              placeholder="Add a note…"
              value={comment}
              rows={1}
              onChange={e => setComment(e.target.value)}
              onBlur={() => onUpdateComment?.(entry.uid, comment)}
              aria-label="Front session note"
            />
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <button
              className={styles.editBtn}
              onClick={() => setShowEdit(s => !s)}
              aria-label="Edit entry"
            >
              Edit
            </button>
            <button
              className={styles.removeBtn}
              onClick={() => onRemove(entry.uid)}
              aria-label="Remove fronter"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
