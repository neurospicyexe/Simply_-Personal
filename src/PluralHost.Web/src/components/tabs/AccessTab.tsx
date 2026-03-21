import { useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi } from '../../api/members'
import type { Member, MemberUpdatePayload } from '../../types'
import styles from './AccessTab.module.css'

interface Props {
  member: Member
}

const PRIVACY_TIERS = ['Public', 'Friend', 'Trusted', 'Private'] as const

export default function AccessTab({ member }: Props) {
  const qc = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: (payload: MemberUpdatePayload) => membersApi.update(member.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', member.id] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })

  return (
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
        <input
          type="checkbox"
          checked={member.isArchived}
          onChange={() => updateMutation.mutate({ isArchived: !member.isArchived })}
          aria-label="Archived"
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Pinned</span>
        <input
          type="checkbox"
          checked={member.isPinned}
          onChange={() => updateMutation.mutate({ isPinned: !member.isPinned })}
          aria-label="Pinned"
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Prevent front notifications</span>
        <input
          type="checkbox"
          checked={member.preventFrontNotification}
          onChange={() => updateMutation.mutate({ preventFrontNotification: !member.preventFrontNotification })}
          aria-label="Prevent front notifications"
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Receive board notifications</span>
        <input
          type="checkbox"
          checked={member.receiveBoardNotifications}
          onChange={() => updateMutation.mutate({ receiveBoardNotifications: !member.receiveBoardNotifications })}
          aria-label="Receive board notifications"
        />
      </div>
    </div>
  )
}
