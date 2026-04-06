import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Member, Group, MemberRelationship, PrivacyBucket } from '../../types'
import styles from './DetailPanel.module.css'

export type SelectedNode =
  | { type: 'member'; id: string }
  | { type: 'group'; id: string }
  | null

interface Props {
  selected: SelectedNode
  members: Member[]
  groups: Group[]
  relationships: MemberRelationship[]
  fronterIds: Set<string>
  buckets: PrivacyBucket[]
  onClose: () => void
}

export function DetailPanel({ selected, members, groups, relationships, fronterIds, buckets, onClose }: Props) {
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!selected) return null

  return (
    <div className={styles.panel} role="complementary" aria-label="Node details">
      <button className={styles.closeBtn} onClick={onClose} aria-label="Close panel">✕</button>

      {selected.type === 'member' && (() => {
        const member = members.find(m => m.id === selected.id)
        if (!member) return null
        const bucket = buckets.find(b => b.id === member.bucketId)
        const isFronting = fronterIds.has(member.id)
        const memberRels = relationships.filter(
          r => r.fromMemberId === member.id || r.toMemberId === member.id
        )

        return (
          <>
            <div className={styles.colorDot} style={{ background: member.color ?? '#888' }} />
            <div className={styles.name}>{member.displayName || member.name}</div>
            {member.pronouns && <div className={styles.pronouns}>{member.pronouns}</div>}
            {isFronting && <div className={styles.frontingBadge}>● Fronting</div>}
            {bucket && (
              <div className={styles.bucketChip}>
                {bucket.emoji && <span>{bucket.emoji}</span>}
                {bucket.name}
              </div>
            )}
            {memberRels.length > 0 && (
              <div className={styles.relsList}>
                <div className={styles.relsLabel}>Relationships</div>
                {memberRels.map(r => {
                  const otherId = r.fromMemberId === member.id ? r.toMemberId : r.fromMemberId
                  const other = members.find(m => m.id === otherId)
                  const arrow = r.isDirected
                    ? (r.fromMemberId === member.id ? '→' : '←')
                    : '↔'
                  return (
                    <div key={r.id} className={styles.relRow}>
                      <span className={styles.relArrow}>{arrow}</span>
                      <span className={styles.relName}>{other?.displayName || other?.name || '?'}</span>
                      <span className={styles.relLabel}>{r.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
            <button
              className={styles.profileBtn}
              onClick={() => navigate(`/members/${member.id}`)}
            >
              Open Profile →
            </button>
          </>
        )
      })()}

      {selected.type === 'group' && (() => {
        const group = groups.find(g => g.id === selected.id)
        if (!group) return null
        const groupMembers = members.filter(m => m.parentIds.includes(group.id))

        return (
          <>
            <div className={styles.colorDot} style={{ background: group.color ?? '#888' }} />
            <div className={styles.name}>{group.name}</div>
            <div className={styles.pronouns}>{group.memberCount} members</div>
            <div className={styles.memberChips}>
              {groupMembers.slice(0, 8).map(m => (
                <div key={m.id} className={styles.memberChip}>
                  <span className={styles.chipDot} style={{ background: m.color ?? '#888' }} />
                  {m.displayName || m.name}
                </div>
              ))}
              {groupMembers.length > 8 && (
                <div className={styles.memberChip}>+{groupMembers.length - 8} more</div>
              )}
            </div>
          </>
        )
      })()}
    </div>
  )
}
