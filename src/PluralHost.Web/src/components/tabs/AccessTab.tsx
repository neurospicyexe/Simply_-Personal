import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { membersApi } from '../../api/members'
import { secureApi } from '../../api/secure'
import BottomSheet from '../BottomSheet'
import type { Member, MemberUpdatePayload } from '../../types'
import styles from './AccessTab.module.css'

interface Props { member: Member }

const PRIVACY_TIERS = ['Public', 'Friend', 'Trusted', 'Private'] as const

export default function AccessTab({ member }: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [cooldownEnd, setCooldownEnd] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    secureApi.status().then(s => {
      if (s.deletionCooldownEnd) {
        const end = new Date(s.deletionCooldownEnd)
        if (end > new Date()) setCooldownEnd(end)
      }
    })
  }, [member.id])

  useEffect(() => {
    if (!cooldownEnd) return
    intervalRef.current = setInterval(() => {
      if (new Date() >= cooldownEnd) {
        setCooldownEnd(null)
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }, 60_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [cooldownEnd])

  const updateMutation = useMutation({
    mutationFn: (payload: MemberUpdatePayload) => membersApi.update(member.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', member.id] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (p: string) => membersApi.delete(member.id, p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] })
      navigate('/members')
    },
    onError: (err: unknown) => {
      // apiFetch throws new Error(`${res.status} ${body}`) — not a raw Response.
      // Parse the status code from the beginning of the error message.
      const msg = err instanceof Error ? err.message : ''
      const status = parseInt(msg)

      if (status === 403) {
        setDeleteError('Incorrect PIN.')
      } else if (status === 409) {
        // Body JSON is embedded after the status code: "409 {"cooldownEnd":"..."}"
        try {
          const jsonPart = msg.slice(msg.indexOf('{'))
          const body = JSON.parse(jsonPart)
          setCooldownEnd(new Date(body.cooldownEnd))
        } catch { /* ignore parse failure */ }
        setDeleteOpen(false)
      } else {
        setDeleteError('Something went wrong. Please try again.')
      }
    },
  })

  const formatCooldown = (end: Date): string => {
    const ms = end.getTime() - Date.now()
    const hours = Math.floor(ms / 3_600_000)
    const mins = Math.floor((ms % 3_600_000) / 60_000)
    return `${hours}h ${mins}m`
  }

  return (
    <div className={styles.tab} role="tabpanel">
      <div className={styles.field}>
        <span className={styles.fieldLabel}>Privacy</span>
        <div className={styles.segmented} role="group" aria-label="Privacy tier">
          {PRIVACY_TIERS.map(tier => (
            <button
              key={tier}
              className={[styles.segBtn, member.privacyTier === tier && styles.segActive].filter(Boolean).join(' ')}
              onClick={() => updateMutation.mutate({ privacyTier: tier })}
              aria-pressed={member.privacyTier === tier}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.checkboxField}>
        <label htmlFor="chk-archived" className={styles.fieldLabel}>Archived</label>
        <input
          id="chk-archived"
          type="checkbox"
          checked={member.isArchived}
          onChange={() => updateMutation.mutate({ isArchived: !member.isArchived })}
        />
      </div>
      <div className={styles.checkboxField}>
        <label htmlFor="chk-pinned" className={styles.fieldLabel}>Pinned</label>
        <input
          id="chk-pinned"
          type="checkbox"
          checked={member.isPinned}
          onChange={() => updateMutation.mutate({ isPinned: !member.isPinned })}
        />
      </div>
      <div className={styles.checkboxField}>
        <label htmlFor="chk-prevent-front" className={styles.fieldLabel}>Prevent front notifications</label>
        <input
          id="chk-prevent-front"
          type="checkbox"
          checked={member.preventFrontNotification}
          onChange={() => updateMutation.mutate({ preventFrontNotification: !member.preventFrontNotification })}
        />
      </div>
      <div className={styles.checkboxField}>
        <label htmlFor="chk-board-notifications" className={styles.fieldLabel}>Receive board notifications</label>
        <input
          id="chk-board-notifications"
          type="checkbox"
          checked={member.receiveBoardNotifications}
          onChange={() => updateMutation.mutate({ receiveBoardNotifications: !member.receiveBoardNotifications })}
        />
      </div>

      <div className={styles.dangerZone}>
        <span className={styles.dangerLabel}>Danger Zone</span>
        {cooldownEnd ? (
          <p className={styles.cooldownMsg}>
            Deletion available in {formatCooldown(cooldownEnd)}
          </p>
        ) : (
          <button
            className={styles.deleteBtn}
            onClick={() => { setDeleteError(null); setPin(''); setDeleteOpen(true) }}
            type="button"
            aria-label={`Delete ${member.name}`}
          >
            Delete {member.name}
          </button>
        )}
      </div>

      <BottomSheet
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete member"
      >
        <p className={styles.deleteWarning}>
          This will remove {member.name} from your system. This action requires your Gatekeeper PIN.
        </p>
        <input
          type="password"
          className={styles.pinInput}
          placeholder="Gatekeeper PIN"
          value={pin}
          onChange={e => setPin(e.target.value)}
          aria-label="Gatekeeper PIN"
          autoComplete="off"
        />
        {deleteError && <p className={styles.deleteError} role="alert">{deleteError}</p>}
        <button
          className={styles.confirmDeleteBtn}
          onClick={() => deleteMutation.mutate(pin)}
          disabled={deleteMutation.isPending || !pin}
          type="button"
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
        </button>
      </BottomSheet>
    </div>
  )
}
