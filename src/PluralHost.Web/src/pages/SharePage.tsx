import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Avatar from '../components/Avatar'
import { shareApi } from '../api/share'
import styles from './SharePage.module.css'

export default function SharePage() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['share', token],
    queryFn: () => shareApi.get(token!),
    enabled: !!token,
    staleTime: 60_000,
    refetchInterval: 30_000,
  })

  const frontingIds = new Set((data?.currentFront ?? []).map(f => f.memberId))

  if (isLoading) return (
    <div className={styles.page}>
      <p className={styles.empty}>Loading…</p>
    </div>
  )

  if (isError) return (
    <div className={styles.page}>
      <p className={styles.errorState}>This link is invalid or has expired.</p>
    </div>
  )

  if (!data?.members.length && !data?.currentFront.length) return (
    <div className={styles.page}>
      <p className={styles.empty}>Nothing to show right now.</p>
    </div>
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>System View</span>
        <h1 className={styles.pageTitle}>
          Currently <span className={styles.accent}>Fronting</span>
        </h1>
      </header>

      <div className={styles.split}>
        <aside className={styles.leftPanel}>
          <p className={styles.panelLabel}>
            {data.currentFront.length > 0
              ? `${data.currentFront.length} active`
              : 'No one fronting'}
          </p>
          {data.currentFront.length === 0 && (
            <p className={styles.emptyQuiet}>Quiet right now.</p>
          )}
          {data.currentFront.map(f => (
            <Link
              key={f.memberId}
              to={`/view/${token}/members/${f.memberId}`}
              className={styles.frontCard}
              style={{ borderLeftColor: f.color ?? 'var(--color-primary)' }}
            >
              <Avatar
                name={f.displayName || f.name}
                color={f.color}
                avatarPath={f.avatarPath}
                isFronting
                size="sm"
              />
              <div className={styles.frontInfo}>
                <div className={styles.memberName}>
                  {f.displayName || f.name}
                  <span className={styles.liveBadge}>Live</span>
                </div>
                {f.customStatusLabel && (
                  <div className={styles.statusRow}>
                    <span
                      className={styles.statusDot}
                      style={{ background: f.customStatusColor ?? 'var(--color-muted)' }}
                    />
                    <span
                      className={styles.statusLabel}
                      style={{ color: f.customStatusColor ?? 'var(--color-muted)' }}
                    >
                      {f.customStatusLabel}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </aside>

        <main className={styles.rightPanel}>
          <p className={styles.panelLabel}>Members · {data.members.length}</p>
          {data.members.map(m => (
            <Link
              key={m.id}
              to={`/view/${token}/members/${m.id}`}
              className={styles.memberRow}
            >
              {frontingIds.has(m.id) && <span className={styles.frontingDot} />}
              <Avatar
                name={m.displayName || m.name}
                color={m.color}
                avatarPath={m.avatarPath}
                size="sm"
              />
              <div className={styles.memberInfo}>
                <div className={styles.memberName}>{m.displayName || m.name}</div>
                {m.pronouns && <div className={styles.memberPronouns}>{m.pronouns}</div>}
                {m.customFields.length > 0 && (
                  <div className={styles.fieldChips}>
                    {m.customFields.slice(0, 3).map((f, i) => (
                      <span key={`${f.label}-${i}`} className={styles.fieldChip}>
                        {f.label}: {f.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </main>
      </div>
    </div>
  )
}
