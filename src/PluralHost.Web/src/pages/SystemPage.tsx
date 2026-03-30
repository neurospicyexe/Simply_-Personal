import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import TabBar from '../components/TabBar'
import GroupSheet from '../components/GroupSheet'
import BucketSheet from '../components/BucketSheet'
import TokenSheet from '../components/TokenSheet'
import FrontStatusSheet from '../components/FrontStatusSheet'
import BottomSheet from '../components/BottomSheet'
import { groupsApi } from '../api/groups'
import { bucketsApi } from '../api/buckets'
import { tokensApi } from '../api/tokens'
import { frontStatusesApi } from '../api/frontStatuses'
import type { FrontStatus } from '../api/frontStatuses'
import type { Group, PrivacyBucket } from '../types'
import styles from './SystemPage.module.css'

const TABS = [
  { id: 'Groups', label: 'Groups' },
  { id: 'Buckets', label: 'Buckets' },
  { id: 'Tokens', label: 'Tokens' },
  { id: 'Statuses', label: 'Statuses' },
]
type Tab = 'Groups' | 'Buckets' | 'Tokens' | 'Statuses'
const validTabs = ['Groups', 'Buckets', 'Tokens', 'Statuses'] as const

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

  // ── sheet state ────────────────────────────────────────────────────────
  const [groupSheet, setGroupSheet] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null })
  const [bucketSheet, setBucketSheet] = useState<{ open: boolean; bucket: PrivacyBucket | null }>({ open: false, bucket: null })
  const [tokenSheetOpen, setTokenSheetOpen] = useState(false)
  const [statusSheet, setStatusSheet] = useState<{ open: boolean; status: FrontStatus | null }>({ open: false, status: null })
  const [statusDeleteTarget, setStatusDeleteTarget] = useState<string | null>(null)
  const [statusDeletePin, setStatusDeletePin] = useState('')

  // ── token revoke/delete state ──────────────────────────────────────────
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)
  const [revokePin, setRevokePin] = useState('')
  const [revokeError, setRevokeError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deletePin, setDeletePin] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  // ── queries ────────────────────────────────────────────────────────────
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: buckets = [] } = useQuery({ queryKey: ['buckets'], queryFn: bucketsApi.list })
  const { data: tokens = [], isLoading: tokensLoading, isError: tokensError } = useQuery({
    queryKey: ['tokens'],
    queryFn: tokensApi.list,
    enabled: tab === 'Tokens',
  })
  const { data: statuses = [], isLoading: statusesLoading, isError: statusesError } = useQuery({
    queryKey: ['front-statuses'],
    queryFn: frontStatusesApi.list,
    enabled: tab === 'Statuses',
  })

  // ── mutations ──────────────────────────────────────────────────────────
  const revokeMutation = useMutation({
    mutationFn: () => tokensApi.revoke(revokeTarget!, revokePin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] })
      setRevokeTarget(null)
      setRevokePin('')
      setRevokeError('')
    },
    onError: (err: Error) => setRevokeError(err.message.includes('403') ? 'Wrong PIN.' : 'Failed to revoke. Is your Gatekeeper PIN set?'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => tokensApi.delete(deleteTarget!, deletePin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tokens'] })
      setDeleteTarget(null)
      setDeletePin('')
      setDeleteError('')
    },
    onError: (err: Error) => setDeleteError(err.message.includes('403') ? 'Wrong PIN.' : 'Failed to delete. Is your Gatekeeper PIN set?'),
  })

  const statusDeleteMutation = useMutation({
    mutationFn: () => frontStatusesApi.delete(statusDeleteTarget!, statusDeletePin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['front-statuses'] })
      setStatusDeleteTarget(null)
      setStatusDeletePin('')
    },
  })

  function copyUrl(tokenValue: string) {
    navigator.clipboard.writeText(`${window.location.origin}/view/${tokenValue}`)
    setCopiedToken(tokenValue)
    setTimeout(() => setCopiedToken(t => t === tokenValue ? null : t), 2000)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className="eyebrow">Manage</span>
          <h1 className={`pageTitle ${styles.pageTitle}`}><span className="accentWord">System</span></h1>
        </div>
        {tab !== 'Tokens' && (
          <button
            className={styles.addBtn}
            onClick={() => {
              if (tab === 'Groups') setGroupSheet({ open: true, group: null })
              else if (tab === 'Buckets') setBucketSheet({ open: true, bucket: null })
              else if (tab === 'Statuses') setStatusSheet({ open: true, status: null })
            }}
            aria-label={`Add ${tab === 'Groups' ? 'group' : tab === 'Buckets' ? 'bucket' : 'status'}`}
          >
            <Plus size={20} />
          </button>
        )}
      </header>

      <TabBar tabs={[...TABS]} activeTab={tab} onChange={t => setTab(t as Tab)} />

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
              <span className={styles.colorDot} style={{ background: g.color ?? 'var(--color-primary)' }} />
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
              <span className={styles.colorBar} style={{ background: b.color ?? 'var(--color-primary)' }} />
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
          {tokensLoading && <p className={styles.empty} role="status">Loading…</p>}
          {tokensError && <p className={styles.empty}>Failed to load tokens.</p>}
          {!tokensLoading && !tokensError && tokens.length === 0 && (
            <p className={styles.empty}>No share links yet. Create one to share your system.</p>
          )}
          <div className={styles.list}>
            {tokens.filter(t => !t.revokedAt).map(t => (
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
                  <button className={styles.copyBtn} onClick={() => copyUrl(t.tokenValue)} aria-label={`Copy URL for ${t.label}`}>
                    {copiedToken === t.tokenValue ? 'Copied!' : '📋 Copy'}
                  </button>
                  <button className={styles.revokeBtn} onClick={() => setRevokeTarget(t.tokenValue)} aria-label={`Revoke ${t.label}`}>
                    Revoke
                  </button>
                </div>
              </div>
            ))}
            {tokens.filter(t => t.revokedAt).slice(0, 10).map(t => (
              <div key={t.tokenValue} className={`${styles.tokenRow} ${styles.revoked}`}>
                <span className={styles.tokenLabel}>{t.label ?? 'Untitled'}</span>
                <span className={styles.badge}>revoked</span>
                <button className={styles.revokeBtn} onClick={() => setDeleteTarget(t.tokenValue)} aria-label={`Delete ${t.label}`}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'Statuses' && (
        <section className={styles.list}>
          {statusesLoading && <p className={styles.empty} role="status">Loading…</p>}
          {statusesError && <p className={styles.empty}>Failed to load statuses.</p>}
          {!statusesLoading && !statusesError && statuses.length === 0 && (
            <p className={styles.empty}>No statuses yet.</p>
          )}
          {statuses.map(s => (
            <div
              key={s.id}
              className={`${styles.statusRow} ${s.isHidden ? styles.hiddenStatus : ''}`}
            >
              <span
                className={styles.colorDot}
                style={{ background: s.color ?? 'var(--color-text-muted)' }}
              />
              <span className={`${styles.statusLabel} ${s.isHidden ? styles.strikethrough : ''}`}>
                {s.label}
              </span>
              {s.isDefault && (
                <span className={styles.defaultBadge}>
                  {s.isHidden ? 'default · hidden' : 'default'}
                </span>
              )}
              {!s.isDefault && s.isHidden && (
                <span className={styles.defaultBadge}>hidden</span>
              )}
              <button
                className={styles.statusEditBtn}
                onClick={() => setStatusSheet({ open: true, status: s })}
                aria-label={`Edit ${s.label}`}
              >
                <Pencil size={14} />
              </button>
              {!s.isDefault && (
                <button
                  className={styles.statusDeleteBtn}
                  onClick={() => { setStatusDeleteTarget(s.id); setStatusSheet({ open: false, status: null }) }}
                  aria-label={`Delete ${s.label}`}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ── Sheets ─────────────────────────────────────────────────────── */}
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
      <FrontStatusSheet
        status={statusSheet.status}
        isOpen={statusSheet.open}
        onClose={() => setStatusSheet({ open: false, status: null })}
        onDeleteRequest={id => { setStatusDeleteTarget(id); setStatusSheet({ open: false, status: null }) }}
      />

      {/* Token revoke confirmation */}
      <BottomSheet isOpen={revokeTarget !== null} onClose={() => { setRevokeTarget(null); setRevokePin(''); setRevokeError('') }} title="Confirm Revoke">
        <p className={styles.revokeHint}>Enter your Gatekeeper PIN to revoke this link.</p>
        <input type="password" className={styles.pinInput} placeholder="PIN" value={revokePin} onChange={e => { setRevokePin(e.target.value); setRevokeError('') }} aria-label="Gatekeeper PIN" />
        {revokeError && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{revokeError}</p>}
        <div className={styles.revokeActions}>
          <button onClick={() => { setRevokeTarget(null); setRevokePin(''); setRevokeError('') }}>Cancel</button>
          <button onClick={() => revokeMutation.mutate()} disabled={!revokePin.trim() || revokeMutation.isPending} className={styles.revokeBtn} aria-label="Confirm revoke">
            {revokeMutation.isPending ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </BottomSheet>

      {/* Token delete confirmation */}
      <BottomSheet isOpen={deleteTarget !== null} onClose={() => { setDeleteTarget(null); setDeletePin(''); setDeleteError('') }} title="Delete Token">
        <p className={styles.revokeHint}>Enter your Gatekeeper PIN to permanently remove this revoked link.</p>
        <input type="password" className={styles.pinInput} placeholder="PIN" value={deletePin} onChange={e => { setDeletePin(e.target.value); setDeleteError('') }} aria-label="Gatekeeper PIN" />
        {deleteError && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem' }}>{deleteError}</p>}
        <div className={styles.revokeActions}>
          <button onClick={() => { setDeleteTarget(null); setDeletePin(''); setDeleteError('') }}>Cancel</button>
          <button onClick={() => deleteMutation.mutate()} disabled={!deletePin.trim() || deleteMutation.isPending} className={styles.revokeBtn} aria-label="Confirm delete">
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </BottomSheet>

      {/* Status delete PIN confirmation */}
      <BottomSheet isOpen={statusDeleteTarget !== null} onClose={() => { setStatusDeleteTarget(null); setStatusDeletePin('') }} title="Delete Status">
        <p className={styles.revokeHint}>Enter your Gatekeeper PIN to permanently delete this status.</p>
        <input type="password" className={styles.pinInput} placeholder="PIN" value={statusDeletePin} onChange={e => setStatusDeletePin(e.target.value)} aria-label="Gatekeeper PIN" />
        <div className={styles.revokeActions}>
          <button onClick={() => { setStatusDeleteTarget(null); setStatusDeletePin('') }}>Cancel</button>
          <button onClick={() => statusDeleteMutation.mutate()} disabled={!statusDeletePin.trim() || statusDeleteMutation.isPending} className={styles.revokeBtn} aria-label="Confirm delete status">
            {statusDeleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
