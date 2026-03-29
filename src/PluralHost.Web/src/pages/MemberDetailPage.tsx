import { useState } from 'react'
import type React from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { membersApi } from '../api/members'
import { groupsApi } from '../api/groups'
import { frontApi } from '../api/front'
import type { SpEnvelope, FrontContent } from '../types'
import Avatar from '../components/Avatar'
import TabBar from '../components/TabBar'
import EssenceTab from '../components/tabs/EssenceTab'
import SpecsTab from '../components/tabs/SpecsTab'
import DossierTab from '../components/tabs/DossierTab'
import CommsTab from '../components/tabs/CommsTab'
import LogsTab from '../components/tabs/LogsTab'
import AccessTab from '../components/tabs/AccessTab'
import PhotosTab from '../components/tabs/PhotosTab'
import styles from './MemberDetailPage.module.css'

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(136,136,136,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

const TABS = [
  { id: 'essence', label: 'Essence' },
  { id: 'specs',   label: 'Specs'   },
  { id: 'dossier', label: 'Dossier' },
  { id: 'comms',   label: 'Comms'   },
  { id: 'logs',    label: 'Logs'    },
  { id: 'access',  label: 'Access'  },
  { id: 'photos',  label: 'Photos'  },
] as const

type TabId = typeof TABS[number]['id']

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [activeTab, setActiveTab] = useState<TabId>('essence')

  const { data: member, isLoading } = useQuery({
    queryKey: ['member', id],
    queryFn: () => membersApi.get(id!),
    enabled: !!id,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  const { data: fronters = [] } = useQuery<SpEnvelope<FrontContent>[]>({
    queryKey: ['fronters'],
    queryFn: frontApi.getCurrent,
  })

  const isFronting = id ? fronters.some(f => f.content.member === id) : false

  if (isLoading || !member) {
    return <div className={styles.loading} role="status" aria-live="polite">Loading…</div>
  }

  const memberColor = member.color ?? '#888888'
  const memberBgImage = member.backgroundImagePath
    ? `url("/api/media/${member.backgroundImagePath}")`
    : 'none'
  const hasImage = !!member.backgroundImagePath

  return (
    <div
      className={styles.page}
      style={{
        '--member-color': memberColor,
        '--member-bg-image': memberBgImage,
        '--member-color-tint5':  hexToRgba(memberColor, 0.05),
        '--member-color-tint27': hexToRgba(memberColor, 0.27),
        '--member-color-tint13': hexToRgba(memberColor, 0.13),
      } as React.CSSProperties}
    >
      <div
        className={styles.hero}
        style={hasImage
          ? { backgroundImage: memberBgImage }
          : { background: `linear-gradient(135deg, ${hexToRgba(memberColor, 0.27)} 0%, ${hexToRgba(memberColor, 0.13)} 50%, transparent 100%)` }
        }
      >
        {hasImage && <div className={styles.heroOverlay} />}
        <div className={styles.heroContent}>
          <Avatar
            name={member.name}
            color={memberColor}
            avatarPath={member.avatarPath}
            size="lg"
          />
          <div className={styles.heroInfo}>
            <h1 className={styles.name}>
              <span style={{ color: member.color ?? 'var(--color-primary)' }}>{member.name[0]}</span>
              {member.name.slice(1)}
            </h1>
            {member.pronouns && <p className={styles.pronouns}>{member.pronouns}</p>}
            {isFronting && <span className={styles.frontingBadge}>Fronting now</span>}
          </div>
        </div>
      </div>

      <TabBar tabs={[...TABS]} activeTab={activeTab} onChange={tab => setActiveTab(tab as TabId)} activeColor={member.color} />

      <div className={styles.content}>
        {activeTab === 'essence'  && <EssenceTab  member={member} groups={groups} />}
        {activeTab === 'specs'    && <SpecsTab    member={member} />}
        {activeTab === 'dossier'  && <DossierTab  member={member} />}
        {activeTab === 'comms'    && <CommsTab    member={member} />}
        {activeTab === 'logs'     && <LogsTab     member={member} />}
        {activeTab === 'access'   && <AccessTab   member={member} />}
        {activeTab === 'photos'   && <PhotosTab   member={member} />}
      </div>
    </div>
  )
}
