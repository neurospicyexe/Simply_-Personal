import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setAuthenticated } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.login(password)
      setAuthenticated(true)
      navigate('/front', { replace: true })
    } catch {
      setError('Invalid password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Sign in</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="password" className={styles.label}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={styles.input}
            autoComplete="current-password"
            required
          />
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" disabled={loading} className={styles.submit}>
            {loading ? 'Signing in\u2026' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
