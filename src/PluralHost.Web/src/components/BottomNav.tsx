import { NavLink } from 'react-router-dom'
import styles from './BottomNav.module.css'

// Placeholder icons — replaced with Lucide in Task 13
const TABS = [
  { to: '/front',    label: 'Front',    icon: '◉' },
  { to: '/members',  label: 'Members',  icon: '◈' },
  { to: '/history',  label: 'History',  icon: '◷' },
  { to: '/settings', label: 'Settings', icon: '⊙' },
]

export default function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            [styles.tab, isActive && styles.active].filter(Boolean).join(' ')
          }
        >
          <span className={styles.icon} aria-hidden="true">{tab.icon}</span>
          <span className={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
