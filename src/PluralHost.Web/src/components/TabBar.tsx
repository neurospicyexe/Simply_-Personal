import styles from './TabBar.module.css'

interface Tab {
  id: string
  label: string
}

interface TabBarProps {
  tabs: Tab[]
  activeTab: string
  onChange: (id: string) => void
  activeColor?: string
}

export default function TabBar({ tabs, activeTab, onChange, activeColor }: TabBarProps) {
  return (
    <div
      className={styles.bar}
      role="tablist"
      style={activeColor ? ({ '--tab-active-color': activeColor } as React.CSSProperties) : undefined}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          className={[styles.tab, activeTab === tab.id && styles.active].filter(Boolean).join(' ')}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
