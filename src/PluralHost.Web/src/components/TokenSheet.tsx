import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import BottomSheet from './BottomSheet'
import { tokensApi } from '../api/tokens'
import { bucketsApi } from '../api/buckets'
import type { AccessToken, PrivacyBucket } from '../types'
import styles from './TokenSheet.module.css'

const FRONT_ONLY = -1

type ExpiryPreset = '7d' | '30d' | '90d' | 'never' | 'custom'

function computeExpiresAt(preset: ExpiryPreset, customDate: string): string | undefined {
  if (preset === 'never') return undefined
  if (preset === 'custom' && customDate) {
    return new Date(customDate + 'T23:59:59Z').toISOString()
  }
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

interface Props {
  isOpen: boolean
  onClose: () => void
  token?: AccessToken | null  // null/undefined = create mode; provided = edit mode
}

export default function TokenSheet({ isOpen, onClose, token }: Props) {
  const qc = useQueryClient()
  const isEdit = !!token

  const todayIso = new Date().toISOString().slice(0, 10)
  const [label, setLabel] = useState('')
  const [accessLevel, setAccessLevel] = useState<number>(0)
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>('never')
  const [customDate, setCustomDate] = useState(todayIso)
  const [allowsBoardPosting, setAllowsBoardPosting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    if (token) {
      setLabel(token.label ?? '')
      setAccessLevel(token.minBucketSortOrder)
      setAllowsBoardPosting(token.allowsBoardPosting)
      setExpiryPreset('never')
      setCustomDate(todayIso)
    } else {
      setLabel('')
      setAccessLevel(0)
      setExpiryPreset('never')
      setCustomDate(todayIso)
      setAllowsBoardPosting(false)
    }
  }, [isOpen, token?.tokenValue])

  const { data: buckets = [] } = useQuery({
    queryKey: ['buckets'],
    queryFn: bucketsApi.list,
  })

  const createMutation = useMutation({
    mutationFn: () => {
      if (!label.trim()) throw new Error('Label is required')
      return tokensApi.create({
        label: label.trim(),
        minBucketSortOrder: accessLevel,
        allowsBoardPosting: accessLevel === FRONT_ONLY ? false : allowsBoardPosting,
        expiresAt: computeExpiresAt(expiryPreset, customDate),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tokens'] })
      handleClose()
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!label.trim()) throw new Error('Label is required')
      return tokensApi.update(token!.tokenValue, {
        label: label.trim(),
        minBucketSortOrder: accessLevel,
        allowsBoardPosting: accessLevel === FRONT_ONLY ? false : allowsBoardPosting,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tokens'] })
      handleClose()
    },
  })

  function handleClose() {
    onClose()
  }

  function selectPreset(p: ExpiryPreset) {
    setExpiryPreset(p)
    if (p !== 'custom') setCustomDate(todayIso)
  }

  const isFrontOnly = accessLevel === FRONT_ONLY
  const canSave = label.trim().length > 0
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title={isEdit ? 'Edit Share Link' : 'New Share Link'}>
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
          <button
            type="button"
            className={`${styles.accessOption} ${isFrontOnly ? styles.selected : ''}`}
            onClick={() => setAccessLevel(FRONT_ONLY)}
          >
            Front Only
            <span className={styles.accessDesc}>Who's fronting, no member list</span>
          </button>
          {(buckets as PrivacyBucket[]).map(b => (
            <button
              key={b.id}
              type="button"
              className={`${styles.accessOption} ${accessLevel === b.sortOrder ? styles.selected : ''}`}
              onClick={() => setAccessLevel(b.sortOrder)}
            >
              {b.name}
              <span className={styles.accessDesc}>
                {b.sortOrder === 0
                  ? 'Fronting + all public members'
                  : `Fronting + ${b.name.toLowerCase()} and above`}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Expiry — create mode only; can't change expiry on existing token */}
      {!isEdit && (
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
      )}

      {/* Board posting toggle — hidden for Front Only */}
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
        <button className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
        <button
          className={styles.createBtn}
          onClick={() => isEdit ? updateMutation.mutate() : createMutation.mutate()}
          disabled={!canSave || isPending}
          aria-label={isEdit ? 'Save changes' : 'Create token'}
        >
          {isPending ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save' : 'Create')}
        </button>
      </div>
    </BottomSheet>
  )
}
