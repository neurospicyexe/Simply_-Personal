import { Radio, Users, Layers, BookOpen, Settings, Network } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import styles from './BottomNav.module.css'

const TABS = [
  { to: '/front',    label: 'Front',    Icon: Radio },
  { to: '/members',  label: 'Members',  Icon: Users },
  { to: '/map',      label: 'Map',      Icon: Network },
  { to: '/system',   label: 'System',   Icon: Layers },
  { to: '/logs',     label: 'Logs',     Icon: BookOpen },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export default function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [styles.tab, isActive && styles.active].filter(Boolean).join(' ')
          }
        >
          <Icon size={20} aria-hidden="true" className={styles.icon} />
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
