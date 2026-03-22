import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import BottomSheet from './BottomSheet'
import MemberPickerList from './MemberPickerList'
import { groupsApi } from '../api/groups'
import { membersApi } from '../api/members'
import type { Group } from '../types'
import styles from './GroupSheet.module.css'

interface Props {
  group: Group | null   // null = create mode
  isOpen: boolean
  onClose: () => void
}

export default function GroupSheet({ group, isOpen, onClose }: Props) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
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
    setName(group?.name ?? '')
    setColor(group?.color ?? '#888888')
    if (group) {
      setSelectedIds(members.filter(m => m.parentIds?.includes(group.id)).map(m => m.id))
    } else {
      setSelectedIds([])
    }
    setConfirmDelete(false)
    setError(null)
  }, [isOpen, group, members])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (group) {
        await groupsApi.update(group.id, { name, color })
        await groupsApi.setMembers(group.id, selectedIds)
      } else {
        const created = await groupsApi.create({ name, color })
        await groupsApi.setMembers(created.id, selectedIds)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      qc.invalidateQueries({ queryKey: ['members'] })
      onClose()
    },
    onError: () => setError('Failed to save. Please try again.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => groupsApi.delete(group!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] })
      onClose()
    },
  })

  const toggle = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={group ? 'Edit group' : 'New group'}>
      <div className={styles.form}>
        <input
          className={styles.nameInput}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Group name"
          aria-label="Group name"
        />
        <label className={styles.colorRow}>
          <span>Color</span>
          <input type="color" value={color} onChange={e => setColor(e.target.value)} />
        </label>
      </div>

      <MemberPickerList members={members} selectedIds={selectedIds} onToggle={toggle} />

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        {group && !confirmDelete && (
          <button className={styles.deleteBtn} onClick={() => setConfirmDelete(true)} type="button">
            <Trash2 size={16} /> Delete group
          </button>
        )}
        {confirmDelete && (
          <button
            className={styles.confirmDeleteBtn}
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            type="button"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Confirm delete'}
          </button>
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
    </BottomSheet>
  )
}
