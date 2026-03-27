import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fieldsApi } from '../../api/fields'
import BottomSheet from '../BottomSheet'
import type { Member, FieldDef } from '../../types'
import styles from './SpecsTab.module.css'

interface Props { member: Member }

const PRESETS = ['Role', 'Age', 'Interests', 'Triggers', 'Likes', 'Dislikes', 'Trauma', 'Strengths']

export default function SpecsTab({ member }: Props) {
  const qc = useQueryClient()

  // value editing
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  // add-field sheet
  const [sheetOpen, setSheetOpen] = useState(false)
  const [customName, setCustomName] = useState('')

  // ··· menu
  const [menuId, setMenuId] = useState<string | null>(null)

  // edit definition sheet
  const [editDefId, setEditDefId] = useState<string | null>(null)
  const [editDefLabel, setEditDefLabel] = useState('')

  // delete definition confirmation
  const [deleteDefId, setDeleteDefId] = useState<string | null>(null)

  const defsQuery = useQuery({ queryKey: ['field-defs'], queryFn: fieldsApi.listDefs })
  const valuesQuery = useQuery({ queryKey: ['member-fields', member.id], queryFn: () => fieldsApi.getMemberFields(member.id) })

  const upsertMutation = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: string }) =>
      fieldsApi.upsertMemberField(member.id, fieldId, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-fields', member.id] }),
  })

  const deleteMemberFieldMutation = useMutation({
    mutationFn: (fieldId: string) => fieldsApi.deleteMemberField(member.id, fieldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-fields', member.id] }),
  })

  const addDefMutation = useMutation({
    mutationFn: (label: string) => fieldsApi.createDef(label),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['field-defs'] }),
  })

  const updateDefMutation = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      fieldsApi.updateDef(id, label),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-defs'] })
      setEditDefId(null)
    },
  })

  const deleteDefMutation = useMutation({
    mutationFn: (id: string) => fieldsApi.deleteDef(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-defs'] })
      qc.invalidateQueries({ queryKey: ['member-fields', member.id] })
      setDeleteDefId(null)
    },
  })

  const activeDefs = (defsQuery.data ?? []).filter((d: FieldDef) => d.deletedAt === null)
  const valueMap = new Map((valuesQuery.data ?? []).map(v => [v.fieldId, v]))

  async function handleAddField(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    let fieldId: string
    const existing = activeDefs.find((d: FieldDef) => d.label.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      fieldId = existing.id
    } else {
      const created = await addDefMutation.mutateAsync(trimmed)
      fieldId = created.id
    }
    if (!valueMap.has(fieldId)) {
      await upsertMutation.mutateAsync({ fieldId, value: '' })
    }
    setSheetOpen(false)
    setCustomName('')
  }

  function startValueEdit(fieldId: string, currentValue: string) {
    setEditingFieldId(fieldId)
    setEditVal(currentValue)
  }

  function commitValueEdit(fieldId: string) {
    upsertMutation.mutate({ fieldId, value: editVal })
    setEditingFieldId(null)
  }

  function openMenu(def: FieldDef) {
    setMenuId(def.id)
  }

  function openEditDef(def: FieldDef) {
    setMenuId(null)
    setEditDefId(def.id)
    setEditDefLabel(def.label)
  }

  function openDeleteDef(defId: string) {
    setMenuId(null)
    setDeleteDefId(defId)
  }

  if (defsQuery.isLoading || valuesQuery.isLoading)
    return <div role="status" className={styles.container}>Loading…</div>
  if (defsQuery.isError || valuesQuery.isError)
    return (
      <div className={styles.error}>
        Failed to load fields<br />
        <button className={styles.retryBtn} onClick={() => { defsQuery.refetch(); valuesQuery.refetch() }}>Retry</button>
      </div>
    )

  const memberDefIds = new Set((valuesQuery.data ?? []).map(v => v.fieldId))
  const menuDef = activeDefs.find((d: FieldDef) => d.id === menuId) ?? null
  const deleteDefLabel = activeDefs.find((d: FieldDef) => d.id === deleteDefId)?.label ?? ''

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span />
        <button className={styles.addBtn} onClick={() => setSheetOpen(true)} aria-label="Add spec">
          <Plus size={16} />
        </button>
      </div>

      {activeDefs.length === 0 && (
        <p className={styles.empty}>No specs defined yet. Use + to add the first one.</p>
      )}

      {activeDefs.map((def: FieldDef) => {
        const entry = valueMap.get(def.id)
        const isEditing = editingFieldId === def.id
        return (
          <div key={def.id} className={styles.fieldRow}>
            {/* Definition header row */}
            <div className={styles.defHeader}>
              <span className={styles.defLabel}>{def.label}</span>
              <button
                className={styles.menuBtn}
                onClick={() => openMenu(def)}
                aria-label={`Options for ${def.label}`}
              >
                ···
              </button>
            </div>

            {/* Member value row */}
            <div className={styles.valueRow}>
              {isEditing ? (
                <input
                  className={styles.fieldInput}
                  value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={() => commitValueEdit(def.id)}
                  onKeyDown={e => e.key === 'Enter' && commitValueEdit(def.id)}
                  autoFocus
                />
              ) : (
                <span
                  className={`${styles.fieldValue} ${!entry?.value ? styles.placeholder : ''}`}
                  onClick={() => startValueEdit(def.id, entry?.value ?? '')}
                >
                  {entry?.value || 'Click to add…'}
                </span>
              )}
              <button
                className={styles.deleteIcon}
                onClick={() => deleteMemberFieldMutation.mutate(def.id)}
                aria-label={`Clear ${def.label} value`}
              >
                🗑
              </button>
            </div>
          </div>
        )
      })}

      {/* Add field sheet */}
      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Add Spec">
        <p className={styles.presetLabel}>Common fields</p>
        <div className={styles.presets}>
          {PRESETS.map(name => {
            const exists = activeDefs.find((d: FieldDef) => d.label.toLowerCase() === name.toLowerCase())
            const alreadyAssigned = exists && memberDefIds.has(exists.id)
            return (
              <button
                key={name}
                className={`${styles.chip} ${alreadyAssigned ? styles.dimmed : ''}`}
                onClick={() => handleAddField(name)}
              >
                {name}
              </button>
            )
          })}
        </div>
        <p className={styles.customLabel}>Or define your own</p>
        <div className={styles.customRow}>
          <input
            className={styles.customInput}
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder="Field name…"
            onKeyDown={e => e.key === 'Enter' && handleAddField(customName)}
          />
          <button
            className={styles.customBtn}
            onClick={() => handleAddField(customName)}
            disabled={!customName.trim()}
          >
            Add
          </button>
        </div>
      </BottomSheet>

      {/* ··· action menu */}
      <BottomSheet
        isOpen={menuId !== null}
        onClose={() => setMenuId(null)}
        title={menuDef?.label ?? ''}
      >
        <button className={styles.actionRow} onClick={() => menuDef && openEditDef(menuDef)}>
          ✏️ Edit definition
        </button>
        <button className={`${styles.actionRow} ${styles.danger}`} onClick={() => menuId && openDeleteDef(menuId)}>
          🗑 Delete definition
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#666' }}>removes from all members</span>
        </button>
      </BottomSheet>

      {/* Edit definition sheet */}
      <BottomSheet
        isOpen={editDefId !== null}
        onClose={() => setEditDefId(null)}
        title="Edit Definition"
      >
        <input
          className={styles.defLabelInput}
          value={editDefLabel}
          onChange={e => setEditDefLabel(e.target.value)}
          placeholder="Field name…"
          onKeyDown={e => e.key === 'Enter' && editDefId && updateDefMutation.mutate({ id: editDefId, label: editDefLabel })}
          autoFocus
        />
        <button
          className={styles.saveDefBtn}
          disabled={!editDefLabel.trim() || updateDefMutation.isPending}
          onClick={() => editDefId && updateDefMutation.mutate({ id: editDefId, label: editDefLabel })}
        >
          {updateDefMutation.isPending ? 'Saving…' : 'Save'}
        </button>
      </BottomSheet>

      {/* Delete definition confirmation */}
      <BottomSheet
        isOpen={deleteDefId !== null}
        onClose={() => setDeleteDefId(null)}
        title="Delete Definition"
      >
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Delete <strong style={{ color: 'var(--color-text)' }}>{deleteDefLabel}</strong>?
          This removes the field from all members and cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setDeleteDefId(null)}
            style={{ flex: 1, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '10px', color: 'var(--color-text)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => deleteDefId && deleteDefMutation.mutate(deleteDefId)}
            disabled={deleteDefMutation.isPending}
            style={{ flex: 1, background: 'var(--color-danger)', border: 'none', borderRadius: '8px', padding: '10px', color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: deleteDefMutation.isPending ? 0.5 : 1 }}
          >
            {deleteDefMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
