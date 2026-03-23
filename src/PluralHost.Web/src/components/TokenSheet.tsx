import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import BottomSheet from './BottomSheet'
import { tokensApi } from '../api/tokens'
import { bucketsApi } from '../api/buckets'
import type { PrivacyBucket } from '../types'
import styles from './TokenSheet.module.css'

const FRONT_ONLY = -1

type ExpiryPreset = '7d' | '30d' | '90d' | 'never' | 'custom'

function computeExpiresAt(preset: ExpiryPreset, customDate: string): string | undefined {
  if (preset === 'never') return undefined
  if (preset === 'custom' && customDate) {
    // End-of-day UTC for the selected date (YYYY-MM-DD -> ISO 8601)
    return new Date(customDate + 'T23:59:59Z').toISOString()
  }
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function TokenSheet({ isOpen, onClose }: Props) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [accessLevel, setAccessLevel] = useState<number>(FRONT_ONLY)
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>('never')
  const todayIso = new Date().toISOString().slice(0, 10)
  const [customDate, setCustomDate] = useState(todayIso)
  const [allowsBoardPosting, setAllowsBoardPosting] = useState(false)

  const { data: buckets = [] } = useQuery({
    queryKey: ['buckets'],
    queryFn: bucketsApi.list,
  })

  const mutation = useMutation({
    mutationFn: () => tokensApi.create({
      label,
      minBucketSortOrder: accessLevel,
      allowsBoardPosting: accessLevel === FRONT_ONLY ? false : allowsBoardPosting,
      expiresAt: computeExpiresAt(expiryPreset, customDate),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tokens'] })
      resetAndClose()
    },
  })

  function resetAndClose() {
    setLabel('')
    setAccessLevel(FRONT_ONLY)
    setExpiryPreset('never')
    setCustomDate(todayIso)
    setAllowsBoardPosting(false)
    onClose()
  }

  function selectPreset(p: ExpiryPreset) {
    setExpiryPreset(p)
    if (p !== 'custom') setCustomDate(todayIso)
  }

  const isFrontOnly = accessLevel === FRONT_ONLY

  return (
    <BottomSheet isOpen={isOpen} onClose={resetAndClose} title="New Share Link">
      {/* Label */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="token-label">Label</label>
        <input
          id="token-label"
          className={styles.input}
          placeholder="e.g. Friend Link"
          value={label}
          onChange={e => setLabel(e.target.value)}
        />
      </div>

      {/* Access Level */}
      <div className={styles.field}>
        <div className={styles.label}>Access Level</div>
        <div className={styles.accessList}>
          <div
            className={`${styles.accessOption} ${isFrontOnly ? styles.selected : ''}`}
            onClick={() => setAccessLevel(FRONT_ONLY)}
          >
            Front Only
            <span className={styles.accessDesc}>Who's fronting, no member list</span>
          </div>
          {(buckets as PrivacyBucket[]).map(b => (
            <div
              key={b.id}
              className={`${styles.accessOption} ${accessLevel === b.sortOrder ? styles.selected : ''}`}
              onClick={() => setAccessLevel(b.sortOrder)}
            >
              {b.name}
            </div>
          ))}
        </div>
      </div>

      {/* Expiry */}
      <div className={styles.field}>
        <div className={styles.label}>Expires</div>
        <div className={styles.chips}>
          {(['7d', '30d', '90d', 'never'] as ExpiryPreset[]).map(p => (
            <button
              key={p}
              className={`${styles.chip} ${expiryPreset === p ? styles.selected : ''}`}
              onClick={() => selectPreset(p)}
            >
              {p === '7d' ? '7 days' : p === '30d' ? '30 days' : p === '90d' ? '90 days' : 'Never'}
            </button>
          ))}
          <button
            className={`${styles.chip} ${expiryPreset === 'custom' ? styles.selected : ''}`}
            onClick={() => selectPreset('custom')}
            aria-label="Custom date"
          >
            📅
          </button>
        </div>
        {expiryPreset === 'custom' && (
          <input
            type="date"
            className={styles.dateInput}
            value={customDate}
            onChange={e => setCustomDate(e.target.value)}
          />
        )}
      </div>

      {/* Board posting toggle -- hidden for Front Only */}
      {!isFrontOnly && (
        <div className={styles.toggleRow}>
          <input
            id="token-board-posting"
            type="checkbox"
            checked={allowsBoardPosting}
            onChange={e => setAllowsBoardPosting(e.target.checked)}
          />
          <label htmlFor="token-board-posting">Allow board posting</label>
        </div>
      )}

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={resetAndClose}>Cancel</button>
        <button
          className={styles.createBtn}
          onClick={() => mutation.mutate()}
          disabled={!label.trim() || mutation.isPending}
          aria-label="Create token"
        >
          {mutation.isPending ? 'Creating...' : 'Create'}
        </button>
      </div>
    </BottomSheet>
  )
}
