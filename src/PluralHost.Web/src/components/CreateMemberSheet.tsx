import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi } from '../api/members'
import type { CreateMemberPayload } from '../types'
import styles from './CreateMemberSheet.module.css'

interface Props {
  onClose: () => void
}

const DEFAULT_COLOR = '#b6ff00'

export default function CreateMemberSheet({ onClose }: Props) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [color, setColor] = useState(DEFAULT_COLOR)

  const { mutate, isPending, error } = useMutation({
    mutationFn: (payload: CreateMemberPayload) => membersApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      onClose()
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    mutate({
      name: name.trim(),
      displayName: displayName.trim() || undefined,
      pronouns: pronouns.trim() || undefined,
      color,
    })
  }

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add member"
      >
        <div className={styles.handle} />
        <h2 className={styles.title}>New member</h2>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.colorRow}>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className={styles.colorPicker}
              aria-label="Member color"
            />
            <div className={styles.colorPreview} style={{ background: color }} />
          </div>

          <label className={styles.label}>
            Name <span className={styles.required}>*</span>
            <input
              className={styles.input}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Aria"
              required
              autoFocus
            />
          </label>

          <label className={styles.label}>
            Display name
            <input
              className={styles.input}
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Shown instead of name (optional)"
            />
          </label>

          <label className={styles.label}>
            Pronouns
            <input
              className={styles.input}
              value={pronouns}
              onChange={e => setPronouns(e.target.value)}
              placeholder="e.g. she/her"
            />
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {(error as Error).message}
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submit} disabled={isPending || !name.trim()}>
              {isPending ? 'Adding…' : 'Add member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
