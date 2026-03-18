import { useAuth } from '../context/AuthContext'
import styles from './SettingsPage.module.css'

export default function SettingsPage() {
  const { logout } = useAuth()

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Settings</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Account</h2>
        <button
          className={styles.logoutBtn}
          onClick={logout}
          aria-label="Log out"
        >
          Log out
        </button>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>More settings coming soon</h2>
        <p className={styles.stub}>
          Additional configuration options will be available in a future update.
        </p>
      </section>
    </div>
  )
}
