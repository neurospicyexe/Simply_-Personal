import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { membersApi } from '../api/members'
import { groupsApi } from '../api/groups'
import Avatar from '../components/Avatar'
import TabBar from '../components/TabBar'
import EssenceTab from '../components/tabs/EssenceTab'
import SpecsTab from '../components/tabs/SpecsTab'
import DossierTab from '../components/tabs/DossierTab'
import CommsTab from '../components/tabs/CommsTab'
import LogsTab from '../components/tabs/LogsTab'
import AccessTab from '../components/tabs/AccessTab'
import styles from './MemberDetailPage.module.css'
import type { SpEnvelope, Group } from '../types'

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

  const { data: groupEnvelopes = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  const groups = useMemo(
    () => (groupEnvelopes as SpEnvelope<Group>[]).map(e => e.content),
    [groupEnvelopes]
  )

  if (isLoading || !member) {
    return <div className={styles.loading}>Loading…</div>
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
          <h1 className={styles.name}>{member.name}</h1>
          {member.pronouns && <p className={styles.pronouns}>{member.pronouns}</p>}
        </div>
      </div>

      <TabBar tabs={TABS} activeTab={activeTab} onChange={tab => setActiveTab(tab as TabId)} />

      {activeTab === 'essence'  && <EssenceTab  member={member} groups={groups} />}
      {activeTab === 'specs'    && <SpecsTab    member={member} />}
      {activeTab === 'dossier'  && <DossierTab  member={member} />}
      {activeTab === 'comms'    && <CommsTab    member={member} />}
      {activeTab === 'logs'     && <LogsTab     member={member} />}
      {activeTab === 'access'   && <AccessTab   member={member} />}
    </div>
  )
}
