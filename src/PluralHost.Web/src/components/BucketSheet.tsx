import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import BottomSheet from './BottomSheet'
import MemberPickerList from './MemberPickerList'
import { bucketsApi, PUBLIC_BUCKET_ID } from '../api/buckets'
import { membersApi } from '../api/members'
import type { PrivacyBucket } from '../types'
import styles from './BucketSheet.module.css'

interface Props {
  bucket: PrivacyBucket | null  // null = create mode
  isOpen: boolean
  onClose: () => void
}

export default function BucketSheet({ bucket, isOpen, onClose }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState('')
  const [color, setColor] = useState('#888888')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  useEffect(() => {
    if (!isOpen) return
    setName(bucket?.name ?? '')
    setDescription(bucket?.description ?? '')
    setEmoji(bucket?.emoji ?? '')
    setColor(bucket?.color ?? '#888888')
    setSelectedIds(members.filter(m => m.bucketId === bucket?.id).map(m => m.id))
    setConfirmDelete(false)
    setError(null)
  }, [isOpen, bucket, members])

  const saveMutation = useMutation({
    mutationFn: async () => {
      let targetBucketId = bucket?.id
      if (!bucket) {
        const created = await bucketsApi.create({ name, description, emoji, color })
        targetBucketId = created.id
      } else {
        await bucketsApi.update(bucket.id, { name, description, emoji, color })
      }
      const previousIds = members.filter(m => m.bucketId === bucket?.id).map(m => m.id)
      const toAdd = selectedIds.filter(id => !previousIds.includes(id))
      const toRemove = previousIds.filter(id => !selectedIds.includes(id))
      await Promise.all([
        ...toAdd.map(id => membersApi.update(id, { bucketId: targetBucketId! })),
        // Removed members fall back to Public (bucketId is non-nullable on backend)
        ...toRemove.map(id => membersApi.update(id, { bucketId: PUBLIC_BUCKET_ID })),
      ])
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buckets'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      onClose()
    },
    onError: () => setError('Failed to save. Please try again.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => bucketsApi.delete(bucket!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buckets'] })
      onClose()
    },
  })

  const toggle = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const isNew = !bucket

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={isNew ? 'New bucket' : 'Edit bucket'}>
      <div className={styles.form}>
        <input
          className={styles.input}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Bucket name"
          aria-label="Bucket name"
          maxLength={150}
        />
        <textarea
          className={styles.textarea}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Description (optional)"
          maxLength={500}
          rows={2}
        />
        <div className={styles.row}>
          <input
            className={styles.emojiInput}
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            placeholder="Emoji"
            aria-label="Emoji"
            maxLength={4}
          />
          <label className={styles.colorRow}>
            <span>Color</span>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} />
          </label>
        </div>
      </div>

      <MemberPickerList members={members} selectedIds={selectedIds} onToggle={toggle} />

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        {!isNew && (
          bucket?.isDefault ? (
            <span className={styles.defaultNote} title="Default buckets cannot be removed">
              Default — cannot delete
            </span>
          ) : confirmDelete ? (
            <button
              className={styles.confirmDeleteBtn}
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              type="button"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
            </button>
          ) : (
            <button className={styles.deleteBtn} onClick={() => setConfirmDelete(true)} type="button">
              <Trash2 size={16} /> Delete
            </button>
          )
        )}
        <button
          className={styles.saveBtn}
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !name.trim()}
          type="button"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>

      {!isNew && (
        <p className={styles.futureNote}>Share token integration coming soon.</p>
      )}
    </BottomSheet>
  )
}
