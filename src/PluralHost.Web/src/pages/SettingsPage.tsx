import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { secureApi } from '../api/secure'
import { apiFetch } from '../api/client'
import styles from './SettingsPage.module.css'

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

  return (
    <div className={styles.page}>
      <h1 className={`pageTitle ${styles.pageTitle}`}><span className="accentWord">Settings</span></h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Account</h2>
        <button className={styles.logoutBtn} onClick={logout} aria-label="Log out" type="button">
          Log out
        </button>
      </section>

      <CollapsibleSection title="Security" defaultOpen>
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