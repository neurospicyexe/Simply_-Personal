import { useState } from 'react'
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
import styles from './MemberDetailPage.module.css'

const TABS = [
  { id: 'essence', label: 'Essence' },
  { id: 'specs',   label: 'Specs'   },
  { id: 'dossier', label: 'Dossier' },
  { id: 'comms',   label: 'Comms'   },
  { id: 'logs',    label: 'Logs'    },
  { id: 'access',  label: 'Access'  },
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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Avatar
          name={member.name}
          color={member.color ?? '#888'}
          avatarPath={member.avatarPath}
          size="lg"
        />
        <div className={styles.headerInfo}>
          <h1 className={styles.name}>
            <span style={{ color: member.color ?? 'var(--color-primary)' }}>{member.name[0]}</span>{member.name.slice(1)}
          </h1>
          {member.pronouns && <p className={styles.pronouns}>{member.pronouns}</p>}
          {isFronting && <span className={styles.frontingBadge}>Fronting now</span>}
        </div>
      </div>

      <TabBar tabs={[...TABS]} activeTab={activeTab} onChange={tab => setActiveTab(tab as TabId)} activeColor={member.color} />

      {activeTab === 'essence'  && <EssenceTab  member={member} groups={groups} />}
      {activeTab === 'specs'    && <SpecsTab    member={member} />}
      {activeTab === 'dossier'  && <DossierTab  member={member} />}
      {activeTab === 'comms'    && <CommsTab    member={member} />}
      {activeTab === 'logs'     && <LogsTab     member={member} />}
      {activeTab === 'access'   && <AccessTab   member={member} />}
    </div>
  )
}
