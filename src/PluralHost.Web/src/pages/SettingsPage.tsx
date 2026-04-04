import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { secureApi } from '../api/secure'
import { apiFetch } from '../api/client'
import { importApi, type ImportResult, type SpImportPayload, type PkImportPayload, type SpGroupEntry } from '../api/import'
import styles from './SettingsPage.module.css'

function ImportResultCard({ result }: { result: ImportResult }) {
  return (
    <div className={styles.resultCard}>
      <div className={styles.resultRow}>
        <span className={styles.resultStat}>{result.created} created</span>
        <span className={styles.resultStat}>{result.updated} updated</span>
        <span className={styles.resultStat}>{result.skipped} skipped</span>
      </div>
      {result.frontHistoryImported > 0 && (
        <p className={styles.resultMeta}>{result.frontHistoryImported} front entries imported</p>
      )}
      {result.groupsImported > 0 && (
        <p className={styles.resultMeta}>{result.groupsImported} group{result.groupsImported !== 1 ? 's' : ''} imported</p>
      )}
      {(result.avatarsDownloaded > 0 || result.avatarsFailed > 0) && (
        <p className={styles.resultMeta}>
          {result.avatarsDownloaded} avatars downloaded
          {result.avatarsFailed > 0 && `, ${result.avatarsFailed} failed`}
        </p>
      )}
      {result.errors.length > 0 && (
        <details className={styles.errorDetails}>
          <summary>{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}</summary>
          <ul className={styles.errorList}>
            {result.errors.map((e, i) => (
              <li key={i}>{e.name ?? e.sourceId}: {e.reason}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function CollapsibleSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={styles.section}>
      <button
        className={styles.sectionToggle}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label={title}
        type="button"
      >
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={[styles.chevron, open ? styles.chevronOpen : ''].filter(Boolean).join(' ')}>›</span>
      </button>
      {open && (
        <div className={styles.sectionBody}>
          {children}
        </div>
      )}
    </section>
  )
}

export default function SettingsPage() {
  const { logout } = useAuth()
  const [pinIsSet, setPinIsSet] = useState(false)

  useEffect(() => {
    secureApi.status().then(s => setPinIsSet(s.pinIsSet))
  }, [])

  // Change Password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [gatekeeperPinForPw, setGatekeeperPinForPw] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)
  const [pwPending, setPwPending] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    setPwSuccess(false)
    if (newPassword.length < 8) { setPwError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match.'); return }
    setPwPending(true)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword, gatekeeperPin: gatekeeperPinForPw }),
      })
      setPwSuccess(true)
      setNewPassword(''); setConfirmPassword(''); setGatekeeperPinForPw('')
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? ''
      const status = parseInt(msg)
      if (status === 403) setPwError('Invalid Gatekeeper PIN.')
      else setPwError('Something went wrong. Please try again.')
    } finally {
      setPwPending(false)
    }
  }

  // Set/Change PIN
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [pinPending, setPinPending] = useState(false)

  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setPinError(null)
    setPinSuccess(false)
    if (newPin.length < 4 || newPin.length > 64) { setPinError('PIN must be 4–64 characters.'); return }
    if (newPin !== confirmPin) { setPinError('PINs do not match.'); return }
    setPinPending(true)
    try {
      await secureApi.setPin({ currentPin: pinIsSet ? currentPin : undefined, newPin })
      setPinSuccess(true)
      setPinIsSet(true)
      setCurrentPin(''); setNewPin(''); setConfirmPin('')
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? ''
      const status = parseInt(msg)
      if (status === 403) setPinError('Current PIN is incorrect.')
      else if (status === 400) setPinError('Invalid input. Check PIN length.')
      else setPinError('Something went wrong.')
    } finally {
      setPinPending(false)
    }
  }

  // ── Import ─────────────────────────────────────────────────────────
  // SP
  const [spJson, setSpJson] = useState('')
  const [spConflict, setSpConflict] = useState('merge_prefer_existing')
  const [spAdvanced, setSpAdvanced] = useState(false)
  const [spIncludeFields, setSpIncludeFields] = useState(true)
  const [spIncludeHistory, setSpIncludeHistory] = useState(true)
  const [spIncludeAvatars, setSpIncludeAvatars] = useState(true)
  const [spIncludeGroups, setSpIncludeGroups] = useState(true)
  const [spResult, setSpResult] = useState<ImportResult | null>(null)

  const spMutation = useMutation({
    mutationFn: (payload: SpImportPayload) => importApi.importSp(payload),
    onSuccess: (data) => setSpResult(data),
  })

  function handleSpFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setSpJson((ev.target?.result as string) ?? '')
    reader.readAsText(file)
  }

  function handleSpImport() {
    let parsed: unknown
    try { parsed = JSON.parse(spJson) } catch { return }
    const p = parsed as Record<string, unknown>
    spMutation.mutate({
      conflictStrategy: spConflict,
      includeCustomFields: spIncludeFields,
      includeFrontHistory: spIncludeHistory,
      includeAvatars: spIncludeAvatars,
      includeGroups: spIncludeGroups,
      members: (p.members as SpImportPayload['members']) ?? [],
      customFields: (p.customFields as SpImportPayload['customFields']) ?? [],
      frontHistory: (p.frontHistory as SpImportPayload['frontHistory']) ?? [],
      groups: (p.groups as SpGroupEntry[]) ?? [],
    })
  }

  // PK
  const [pkToken, setPkToken] = useState('')
  const [pkConflict, setPkConflict] = useState('merge_prefer_existing')
  const [pkAdvanced, setPkAdvanced] = useState(false)
  const [pkIncludeHistory, setPkIncludeHistory] = useState(true)
  const [pkIncludeAvatars, setPkIncludeAvatars] = useState(true)
  const [pkResult, setPkResult] = useState<ImportResult | null>(null)

  const pkMutation = useMutation({
    mutationFn: (payload: PkImportPayload) => importApi.importPk(payload),
    onSuccess: (data) => setPkResult(data),
  })

  return (
    <div className={styles.page}>
      <h1 className={`pageTitle ${styles.pageTitle}`}><span className="accentWord">Settings</span></h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Account</h2>
        <button className={styles.logoutBtn} onClick={logout} aria-label="Log out" type="button">
          Log out
        </button>
      </section>

      <CollapsibleSection title="Import">
        <div className={styles.importGrid}>

          {/* SP card */}
          <div className={styles.importCard}>
            <h3 className={styles.importCardTitle}>Simply Plural</h3>
            <div className={styles.importFileRow}>
              <label className={styles.fileBtn}>
                Choose file
                <input type="file" accept=".json" hidden onChange={handleSpFile} />
              </label>
              <span className={styles.fileHint}>{spJson ? 'JSON loaded ✓' : 'or paste below'}</span>
            </div>
            <textarea
              className={styles.jsonTextarea}
              placeholder="Paste SP export JSON here…"
              value={spJson}
              onChange={e => setSpJson(e.target.value)}
              rows={5}
            />
            <label className={styles.checkRow}>
              <input type="checkbox" checked={spIncludeFields}
                onChange={e => setSpIncludeFields(e.target.checked)} />
              Import custom fields
            </label>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={spIncludeHistory}
                onChange={e => setSpIncludeHistory(e.target.checked)} />
              Import front history
            </label>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={spIncludeAvatars}
                onChange={e => setSpIncludeAvatars(e.target.checked)} />
              Download avatars
            </label>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={spIncludeGroups}
                onChange={e => setSpIncludeGroups(e.target.checked)} />
              Import groups
            </label>
            <div className={styles.conflictRow}>
              <span className={styles.conflictPill}>Safe merge</span>
              <button className={styles.advancedToggle} type="button" onClick={() => setSpAdvanced(v => !v)}>
                Advanced {spAdvanced ? '▲' : '▾'}
              </button>
            </div>
            {spAdvanced && (
              <select className={styles.conflictSelect} value={spConflict}
                onChange={e => setSpConflict(e.target.value)}>
                <option value="merge_prefer_existing">Safe merge (keep existing)</option>
                <option value="merge_prefer_imported">Prefer imported</option>
                <option value="overwrite">Overwrite all</option>
                <option value="skip">Skip existing</option>
                <option value="duplicate">Always duplicate</option>
              </select>
            )}
            <button
              className={styles.importBtn}
              type="button"
              disabled={!spJson.trim() || spMutation.isPending}
              onClick={handleSpImport}
            >
              {spMutation.isPending ? 'Importing…' : 'Import from Simply Plural'}
            </button>
            {spMutation.isError && <p className={styles.importError}>Import failed. Check JSON format.</p>}
            {spResult && <ImportResultCard result={spResult} />}
          </div>

          {/* PK card */}
          <div className={styles.importCard}>
            <h3 className={styles.importCardTitle}>PluralKit</h3>
            <p className={styles.importHint}>Token is used once and never stored.</p>
            <input
              type="password"
              className={styles.tokenInput}
              placeholder="PluralKit token"
              value={pkToken}
              onChange={e => setPkToken(e.target.value)}
            />
            <label className={styles.checkRow}>
              <input type="checkbox" checked={pkIncludeHistory}
                onChange={e => setPkIncludeHistory(e.target.checked)} />
              Import front history
            </label>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={pkIncludeAvatars}
                onChange={e => setPkIncludeAvatars(e.target.checked)} />
              Download avatars
            </label>
            <div className={styles.conflictRow}>
              <span className={styles.conflictPill}>Safe merge</span>
              <button className={styles.advancedToggle} type="button" onClick={() => setPkAdvanced(v => !v)}>
                Advanced {pkAdvanced ? '▲' : '▾'}
              </button>
            </div>
            {pkAdvanced && (
              <select className={styles.conflictSelect} value={pkConflict}
                onChange={e => setPkConflict(e.target.value)}>
                <option value="merge_prefer_existing">Safe merge (keep existing)</option>
                <option value="merge_prefer_imported">Prefer imported</option>
                <option value="overwrite">Overwrite all</option>
                <option value="skip">Skip existing</option>
                <option value="duplicate">Always duplicate</option>
              </select>
            )}
            <button
              className={styles.importBtn}
              type="button"
              disabled={!pkToken.trim() || pkMutation.isPending}
              onClick={() => pkMutation.mutate({
                token: pkToken,
                conflictStrategy: pkConflict,
                includeFrontHistory: pkIncludeHistory,
                includeAvatars: pkIncludeAvatars,
              })}
            >
              {pkMutation.isPending ? 'Importing…' : 'Import from PluralKit'}
            </button>
            {pkMutation.isError && <p className={styles.importError}>Import failed. Check token.</p>}
            {pkResult && <ImportResultCard result={pkResult} />}
          </div>

        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Security">
        <div className={styles.subSection}>
          <h3 className={styles.subTitle}>Change Password</h3>
          <form onSubmit={handleChangePassword} className={styles.form}>
            <input
              type="password"
              className={styles.input}
              placeholder="New password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              aria-label="New password"
              autoComplete="new-password"
            />
            <input
              type="password"
              className={styles.input}
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              aria-label="Confirm new password"
              autoComplete="new-password"
            />
            <input
              type="password"
              className={styles.input}
              placeholder="Gatekeeper PIN"
              value={gatekeeperPinForPw}
              onChange={e => setGatekeeperPinForPw(e.target.value)}
              aria-label="Gatekeeper PIN for password change"
              autoComplete="off"
            />
            {pwError && <p className={styles.error} role="alert">{pwError}</p>}
            {pwSuccess && <p className={styles.success}>Password changed.</p>}
            <button type="submit" className={styles.submitBtn} disabled={pwPending}>
              {pwPending ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </div>

        <div className={styles.subSection}>
          <h3 className={styles.subTitle}>Gatekeeper PIN</h3>
          <form onSubmit={handleSetPin} className={styles.form}>
            {pinIsSet && (
              <input
                type="password"
                className={styles.input}
                placeholder="Current PIN"
                value={currentPin}
                onChange={e => setCurrentPin(e.target.value)}
                aria-label="Current PIN"
                autoComplete="off"
              />
            )}
            <input
              type="password"
              className={styles.input}
              placeholder="New PIN"
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
              aria-label="New PIN"
              autoComplete="off"
            />
            <input
              type="password"
              className={styles.input}
              placeholder="Confirm new PIN"
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value)}
              aria-label="Confirm new PIN"
              autoComplete="off"
            />
            {pinError && <p className={styles.error} role="alert">{pinError}</p>}
            {pinSuccess && <p className={styles.success}>{pinIsSet ? 'PIN changed.' : 'PIN set.'}</p>}
            <button type="submit" className={styles.submitBtn} disabled={pinPending}>
              {pinPending ? 'Saving…' : pinIsSet ? 'Change PIN' : 'Set PIN'}
            </button>
          </form>
        </div>
      </CollapsibleSection>
    </div>
  )
}