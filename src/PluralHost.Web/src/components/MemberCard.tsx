import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import styles from './MemberCard.module.css'
import type { Member, PrivacyBucket } from '../types'

interface MemberCardProps {
  member: Member
  isFronting?: boolean
  compact?: boolean
  bucket?: PrivacyBucket
  onQuickAdd?: () => void
}

export default function MemberCard({ member, isFronting = false, compact = false, bucket, onQuickAdd }: MemberCardProps) {
  if (compact) {
    return (
      <Link to={`/members/${member.id}`} className={styles.compactItem}>
        <span className={styles.compactName}>{member.name}</span>
        {isFronting && (
        <span
          className={styles.frontDot}
          style={{ background: member.color ?? 'var(--color-cyan)' }}
          aria-label="Fronting"
        />
      )}
      </Link>
    )
  }

  return (
    <Link
      to={`/members/${member.id}`}
      className={styles.card}
      style={{ '--member-color': member.color } as React.CSSProperties}
    >
      <Avatar
        name={member.name}
        color={member.color ?? '#888'}
        avatarPath={member.avatarPath}
        isFronting={isFronting}
        size="md"
      />
      <div className={styles.info}>
        <span className={styles.name}>{member.name}</span>
        {member.pronouns && <span className={styles.pronouns}>{member.pronouns}</span>}
        {bucket && (
          <span className={styles.bucketChip}>
            {bucket.emoji && <span>{bucket.emoji}</span>}
            {bucket.name}
          </span>
        )}
      </div>
      {onQuickAdd && !isFronting && (
        <button
          className={styles.quickAddBtn}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onQuickAdd() }}
          aria-label={`Add ${member.name} to front`}
          title="Add to front"
        >
          +
        </button>
      )}
    </Link>
  )
}
