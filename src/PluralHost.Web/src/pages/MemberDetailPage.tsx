import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi } from '../api/members'
import { groupsApi } from '../api/groups'
import Avatar from '../components/Avatar'
import TabBar from '../components/TabBar'
import styles from './MemberDetailPage.module.css'
import type { MemberUpdatePayload, SpEnvelope, Group } from '../types'

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'options', label: 'Options' },
]

const PRIVACY_TIERS = ['Public', 'Friend', 'Trusted', 'Private'] as const

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('profile')

  const [editField, setEditField] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const { data: member, isLoading } = useQuery({
    queryKey: ['member', id],
    queryFn: () => membersApi.get(id!),
    enabled: !!id,
  })

  const { data: groupEnvelopes = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  const groups = useMemo(
    () => (groupEnvelopes as SpEnvelope<Group>[]).map(e => e.content),
    [groupEnvelopes]
  )

  const updateMutation = useMutation({
    mutationFn: (payload: MemberUpdatePayload) => membersApi.update(id!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] })
      qc.invalidateQueries({ queryKey: ['members'] })
      setEditField(null)
    },
  })

  const groupMutation = useMutation({
    mutationFn: (groupIds: string[]) => groupsApi.setMemberships(id!, groupIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })

  if (isLoading || !member) {
    return <div className={styles.loading}>Loading…</div>
  }

  const startEdit = (field: string, current: string) => {
    setEditField(field)
    setEditValues(v => ({ ...v, [field]: current }))
  }

  const saveField = (field: string, key: keyof MemberUpdatePayload) => {
    updateMutation.mutate({ [key]: editValues[field] } as MemberUpdatePayload)
  }

  const cancelEdit = () => setEditField(null)

  const memberGroupIds = groups
    .filter(g => g.members.includes(id!))
    .map(g => g.id)

  const toggleGroup = (groupId: string) => {
    const next = memberGroupIds.includes(groupId)
      ? memberGroupIds.filter(gid => gid !== groupId)
      : [...memberGroupIds, groupId]
    groupMutation.mutate(next)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Avatar
          name={member.name}
          color={member.color ?? '#888'}
          avatarPath={member.avatarPath}
          size="lg"
        />
        <div className={styles.headerInfo}>
          <h1 className={styles.name}>{member.name}</h1>
          {member.pronouns && <p className={styles.pronouns}>{member.pronouns}</p>}
        </div>
      </div>

      <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'profile' && (
        <div className={styles.tab} role="tabpanel">
          <EditableField
            label="Name"
            value={member.name}
            fieldKey="name"
            editField={editField}
            editValues={editValues}
            onStartEdit={startEdit}
            onSave={() => saveField('name', 'name')}
            onCancel={cancelEdit}
            onEditChange={(v) => setEditValues(ev => ({ ...ev, name: v }))}
          />

          <EditableField
            label="Pronouns"
            value={member.pronouns ?? ''}
            fieldKey="pronouns"
            editField={editField}
            editValues={editValues}
            onStartEdit={startEdit}
            onSave={() => saveField('pronouns', 'pronouns')}
            onCancel={cancelEdit}
            onEditChange={(v) => setEditValues(ev => ({ ...ev, pronouns: v }))}
          />

          <EditableField
            label="Description"
            value={member.description ?? ''}
            fieldKey="description"
            editField={editField}
            editValues={editValues}
            onStartEdit={startEdit}
            onSave={() => saveField('description', 'description')}
            onCancel={cancelEdit}
            onEditChange={(v) => setEditValues(ev => ({ ...ev, description: v }))}
            multiline
          />

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Color</span>
            <div className={styles.colorRow}>
              <span
                className={styles.colorSwatch}
                style={{ background: member.color ?? '#888' }}
                aria-label={`Color: ${member.color ?? 'none'}`}
              />
              <input
                type="color"
                className={styles.colorInput}
                value={member.color ?? '#888888'}
                onChange={e => updateMutation.mutate({ color: e.target.value })}
                aria-label="Pick member color"
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Groups</span>
            <div className={styles.groupChips}>
              {groups.map(group => (
                <button
                  key={group.id}
                  className={[
                    styles.chip,
                    memberGroupIds.includes(group.id) && styles.chipActive,
                  ].filter(Boolean).join(' ')}
                  onClick={() => toggleGroup(group.id)}
                  aria-pressed={memberGroupIds.includes(group.id)}
                >
                  {group.name}
                </button>
              ))}
              {groups.length === 0 && (
                <span className={styles.fieldEmpty}>No groups yet</span>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'options' && (
        <div className={styles.tab} role="tabpanel">
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Privacy</span>
            <div className={styles.segmented} role="group" aria-label="Privacy tier">
              {PRIVACY_TIERS.map(tier => (
                <button
                  key={tier}
                  className={[
                    styles.segBtn,
                    member.privacyTier === tier && styles.segActive,
                  ].filter(Boolean).join(' ')}
                  onClick={() => updateMutation.mutate({ privacyTier: tier })}
                  aria-pressed={member.privacyTier === tier}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Archived</span>
            <button
              className={[styles.toggle, member.isArchived && styles.toggleOn].filter(Boolean).join(' ')}
              onClick={() => updateMutation.mutate({ isArchived: !member.isArchived })}
              aria-pressed={member.isArchived}
            >
              {member.isArchived ? 'Yes' : 'No'}
            </button>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Prevent front notifications</span>
            <button
              className={[styles.toggle, member.preventFrontNotification && styles.toggleOn].filter(Boolean).join(' ')}
              onClick={() => updateMutation.mutate({ preventFrontNotification: !member.preventFrontNotification })}
              aria-pressed={member.preventFrontNotification}
            >
              {member.preventFrontNotification ? 'On' : 'Off'}
            </button>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Receive board notifications</span>
            <button
              className={[styles.toggle, member.receiveBoardNotifications && styles.toggleOn].filter(Boolean).join(' ')}
              onClick={() => updateMutation.mutate({ receiveBoardNotifications: !member.receiveBoardNotifications })}
              aria-pressed={member.receiveBoardNotifications}
            >
              {member.receiveBoardNotifications ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface EditableFieldProps {
  label: string
  value: string
  fieldKey: string
  editField: string | null
  editValues: Record<string, string>
  onStartEdit: (field: string, current: string) => void
  onSave: () => void
  onCancel: () => void
  onEditChange: (v: string) => void
  multiline?: boolean
}

function EditableField({
  label, value, fieldKey, editField, editValues,
  onStartEdit, onSave, onCancel, onEditChange, multiline,
}: EditableFieldProps) {
  const isEditing = editField === fieldKey

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {isEditing ? (
        <div className={styles.editRow}>
          {multiline ? (
            <textarea
              className={styles.textarea}
              value={editValues[fieldKey] ?? ''}
              onChange={e => onEditChange(e.target.value)}
              autoFocus
              aria-label={label}
            />
          ) : (
            <input
              className={styles.input}
              value={editValues[fieldKey] ?? ''}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
              autoFocus
              aria-label={label}
            />
          )}
          <div className={styles.editBtns}>
            <button className={styles.saveBtn} onClick={onSave} aria-label={`Save ${label}`}>Save</button>
            <button className={styles.cancelBtn} onClick={onCancel} aria-label="Cancel">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          className={styles.fieldValue}
          onClick={() => onStartEdit(fieldKey, value)}
          aria-label={`Edit ${label}`}
        >
          {value || <span className={styles.fieldEmpty}>Tap to edit…</span>}
        </button>
      )}
    </div>
  )
}
