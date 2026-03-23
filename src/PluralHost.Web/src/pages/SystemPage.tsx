import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import TabBar from '../components/TabBar'
import GroupSheet from '../components/GroupSheet'
import BucketSheet from '../components/BucketSheet'
import TokenSheet from '../components/TokenSheet'
import BottomSheet from '../components/BottomSheet'
import { groupsApi } from '../api/groups'
import { bucketsApi } from '../api/buckets'
import { tokensApi } from '../api/tokens'
import type { Group, PrivacyBucket } from '../types'
import styles from './SystemPage.module.css'

const TABS = [
  { id: 'Groups', label: 'Groups' },
  { id: 'Buckets', label: 'Buckets' },
  { id: 'Tokens', label: 'Tokens' },
]
type Tab = 'Groups' | 'Buckets' | 'Tokens'
const validTabs = ['Groups', 'Buckets', 'Tokens'] as const

function bucketName(sortOrder: number, buckets: PrivacyBucket[]): string {
  return buckets.find(b => b.sortOrder === sortOrder)?.name ?? `Level ${sortOrder}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SystemPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab = (validTabs.includes(rawTab as Tab) ? rawTab : 'Groups') as Tab
  function setTab(t: Tab) { setSearchParams({ tab: t }) }

  const queryClient = useQueryClient()
  const [groupSheet, setGroupSheet] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null })
  const [bucketSheet, setBucketSheet] = useState<{ open: boolean; bucket: PrivacyBucket | null }>({ open: false, bucket: null })
  const [tokenSheetOpen, setTokenSheetOpen] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)
  const [revokePin, setRevokePin] = useState('')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: buckets = [] } = useQuery({ queryKey: ['buckets'], queryFn: bucketsApi.list })
  const { data: tokens = [], isLoading: tokensLoading, isError: tokensError } = useQuery({
    queryKey: ['tokens'],
    queryFn: tokensApi.list,
    enabled: tab === 'Tokens',
  })

  const revokeMutation = useMutation({
    mutationFn: () => tokensApi.revoke(revokeTarget!, revokePin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] })
      setRevokeTarget(null)
      setRevokePin('')
    },
  })

  function copyUrl(tokenValue: string) {
    navigator.clipboard.writeText(`${window.location.origin}/share/${tokenValue}`)
    setCopiedToken(tokenValue)
    setTimeout(() => setCopiedToken(t => t === tokenValue ? null : t), 2000)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>System</h1>
        {tab !== 'Tokens' && (
          <button
            className={styles.addBtn}
            onClick={() =>
              tab === 'Groups'
                ? setGroupSheet({ open: true, group: null })
                : setBucketSheet({ open: true, bucket: null })
            }
            aria-label={`Add ${tab === 'Groups' ? 'group' : 'bucket'}`}
          >
            <Plus size={20} />
          </button>
        )}
      </header>

      <TabBar tabs={TABS} activeTab={tab} onChange={t => setTab(t as Tab)} />

      {tab === 'Groups' && (
        <section className={styles.list}>
          {groups.length === 0 && (
            <p className={styles.empty}>No groups yet. Tap + to create one.</p>
          )}
          {groups.map(g => (
            <button
              key={g.id}
              className={styles.card}
              onClick={() => setGroupSheet({ open: true, group: g })}
            >
              <span
                className={styles.colorDot}
                style={{ background: g.color ?? 'var(--color-primary)' }}
              />
              <span className={styles.cardName}>{g.name}</span>
              <span className={styles.cardCount}>{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</span>
            </button>
          ))}
        </section>
      )}

      {tab === 'Buckets' && (
        <section className={styles.list}>
          {buckets.map(b => (
            <button
              key={b.id}
              className={styles.card}
              onClick={() => setBucketSheet({ open: true, bucket: b })}
            >
              <span className={styles.emoji}>{b.emoji ?? '🪣'}</span>
              <span
                className={styles.colorBar}
                style={{ background: b.color ?? 'var(--color-primary)' }}
              />
              <span className={styles.cardName}>{b.name}</span>
              <span className={styles.cardCount}>{b.memberCount} member{b.memberCount !== 1 ? 's' : ''}</span>
            </button>
          ))}
        </section>
      )}

      {tab === 'Tokens' && (
        <>
          <div className={styles.tabHeader}>
            <button className={styles.addBtn} onClick={() => setTokenSheetOpen(true)} aria-label="Add token">
              <Plus size={20} />
            </button>
          </div>
          {tokensLoading && <p className={styles.empty} role="status" aria-live="polite">Loading…</p>}
          {tokensError && <p className={styles.empty}>Failed to load tokens.</p>}
          {!tokensLoading && !tokensError && tokens.length === 0 && (
            <p className={styles.empty}>No share links yet.</p>
          )}
          <div className={styles.list}>
            {tokens
              .filter(t => !t.revokedAt)
              .map(t => (
                <div key={t.tokenValue} className={styles.tokenRow}>
                  <div className={styles.tokenInfo}>
                    <span className={styles.tokenLabel}>{t.label ?? 'Untitled'}</span>
                    <div className={styles.tokenMeta}>
                      <span className={styles.badge}>
                        {t.minBucketSortOrder === -1 ? 'Front Only' : bucketName(t.minBucketSortOrder, buckets)}
                      </span>
                      {t.expiresAt && <span className={styles.metaItem}>expires {fmtDate(t.expiresAt)}</span>}
                      {!t.expiresAt && <span className={styles.metaItem}>no expiry</span>}
                      {t.allowsBoardPosting && <span className={styles.metaItem}>board ✓</span>}
                    </div>
                  </div>
                  <div className={styles.tokenActions}>
                    <button
                      className={styles.copyBtn}
                      onClick={() => copyUrl(t.tokenValue)}
                      aria-label={`Copy URL for ${t.label}`}
                    >
                      {copiedToken === t.tokenValue ? 'Copied!' : '📋 Copy'}
                    </button>
                    <button
                      className={styles.revokeBtn}
                      onClick={() => setRevokeTarget(t.tokenValue)}
                      aria-label={`Revoke ${t.label}`}
                    >
                      Revoke
                    </button>
                  </div>
                </div>
              ))}
            {tokens
              .filter(t => t.revokedAt)
              .slice(0, 10)
              .map(t => (
                <div key={t.tokenValue} className={`${styles.tokenRow} ${styles.revoked}`}>
                  <span className={styles.tokenLabel}>{t.label ?? 'Untitled'}</span>
                  <span className={styles.badge}>revoked</span>
                </div>
              ))}
          </div>
        </>
      )}

      <GroupSheet
        group={groupSheet.group}
        isOpen={groupSheet.open}
        onClose={() => setGroupSheet({ open: false, group: null })}
      />
      <BucketSheet
        bucket={bucketSheet.bucket}
        isOpen={bucketSheet.open}
        onClose={() => setBucketSheet({ open: false, bucket: null })}
      />
      <TokenSheet isOpen={tokenSheetOpen} onClose={() => setTokenSheetOpen(false)} />

      <BottomSheet
        isOpen={revokeTarget !== null}
        onClose={() => { setRevokeTarget(null); setRevokePin('') }}
        title="Confirm Revoke"
      >
        <p className={styles.revokeHint}>
          Enter your Gatekeeper PIN to revoke this link.
        </p>
        <input
          type="password"
          className={styles.pinInput}
          placeholder="PIN"
          value={revokePin}
          onChange={e => setRevokePin(e.target.value)}
          aria-label="Gatekeeper PIN"
        />
        <div className={styles.revokeActions}>
          <button onClick={() => { setRevokeTarget(null); setRevokePin('') }}>Cancel</button>
          <button
            onClick={() => revokeMutation.mutate()}
            disabled={!revokePin.trim() || revokeMutation.isPending}
            className={styles.revokeBtn}
            aria-label="Confirm revoke"
          >
            {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
