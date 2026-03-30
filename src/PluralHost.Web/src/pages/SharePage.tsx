import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import Avatar from '../components/Avatar'

interface ShareMember {
  id: string
  name: string
  displayName?: string
  pronouns?: string
  description?: string
  color?: string
  avatarPath?: string
  customFields?: { label: string; value: string }[]
}

interface ShareFrontEntry {
  member: string
  live: boolean
}

interface ShareData {
  members: ShareMember[]
  currentFront: ShareFrontEntry[]
}

async function fetchShare(token: string): Promise<ShareData> {
  const res = await fetch(`/share/${token}`, { credentials: 'include' })
  if (res.status === 204 || res.status === 401) return { members: [], currentFront: [] }
  if (!res.ok) throw new Error(res.status.toString())
  return res.json()
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['share', token],
    queryFn: () => fetchShare(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const frontingIds = new Set((data?.currentFront ?? []).map(f => f.member))
  const fronting = (data?.members ?? []).filter(m => frontingIds.has(m.id))
  const rest = (data?.members ?? []).filter(m => !frontingIds.has(m.id))

  if (isLoading) return (
    <div style={styles.page}>
      <p style={styles.muted}>Loading…</p>
    </div>
  )

  if (isError) return (
    <div style={styles.page}>
      <p style={styles.muted}>This link is invalid or has expired.</p>
    </div>
  )

  if (!data?.members.length && !data?.currentFront.length) return (
    <div style={styles.page}>
      <p style={styles.muted}>Nothing to show right now.</p>
    </div>
  )

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <span style={styles.eyebrow}>Shared View</span>
      </header>

      {fronting.length > 0 && (
        <section style={styles.section}>
          <p style={styles.sectionLabel}>Currently Fronting</p>
          <div style={styles.frontRow}>
            {fronting.map(m => (
              <div key={m.id} style={styles.frontCard}>
                <Avatar
                  name={m.displayName || m.name}
                  color={m.color}
                  avatarPath={m.avatarPath}
                  isFronting
                  size="lg"
                />
                <span style={styles.memberName}>{m.displayName || m.name}</span>
                {m.pronouns && <span style={styles.pronouns}>{m.pronouns}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section style={styles.section}>
          <p style={styles.sectionLabel}>Members</p>
          <div style={styles.memberList}>
            {rest.map(m => (
              <div key={m.id} style={styles.memberRow}>
                <Avatar
                  name={m.displayName || m.name}
                  color={m.color}
                  avatarPath={m.avatarPath}
                  size="sm"
                />
                <div style={styles.memberInfo}>
                  <span style={styles.memberName}>{m.displayName || m.name}</span>
                  {m.pronouns && <span style={styles.pronouns}>{m.pronouns}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--color-bg, #0a0a0a)',
    color: 'var(--color-text, #fff)',
    fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    padding: '1.5rem 1rem 4rem',
    maxWidth: 480,
    margin: '0 auto',
  },
  header: { marginBottom: '1.5rem' },
  eyebrow: {
    fontSize: '0.62rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.14em',
    color: 'var(--color-muted, #666)',
  },
  section: { marginBottom: '2rem' },
  sectionLabel: {
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    color: 'var(--color-muted, #666)',
    marginBottom: '0.75rem',
  },
  frontRow: { display: 'flex', gap: '1rem', flexWrap: 'wrap' as const },
  frontCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '0.4rem',
  },
  memberList: { display: 'flex', flexDirection: 'column' as const, gap: '0.5rem' },
  memberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0.75rem',
    background: 'var(--color-surface, #111)',
    borderRadius: 10,
  },
  memberInfo: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  memberName: { fontSize: '0.95rem', fontWeight: 600 },
  pronouns: { fontSize: '0.75rem', color: 'var(--color-muted, #666)' },
  muted: { color: 'var(--color-muted, #666)', padding: '2rem 0' },
}
