import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DetailPanel } from '../components/Map/DetailPanel'
import type { Member, Group, MemberRelationship, PrivacyBucket } from '../types'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
)

const bucket: PrivacyBucket = {
  id: 'bucket1',
  name: 'Public',
  description: null,
  emoji: null,
  color: null,
  sortOrder: 0,
  isDefault: true,
  memberCount: 1,
}

const member: Member = {
  id: 'm1',
  name: 'Mira',
  displayName: 'Mira',
  pronouns: 'she/her',
  color: '#b6ff00',
  avatarPath: undefined,
  backgroundImagePath: null,
  extraImages: [],
  description: '',
  bucketId: 'bucket1',
  isArchived: false,
  isUntracked: false,
  isPinned: false,
  preventFrontNotification: false,
  receiveBoardNotifications: false,
  groupIds: [],
  parentIds: ['g1'],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const group: Group = {
  id: 'g1',
  name: 'Protectors',
  description: '',
  color: '#ff4db8',
  emoji: '🛡️',
  parentGroupId: undefined,
  memberCount: 1,
}

const rels: MemberRelationship[] = [
  {
    id: 'r1',
    fromMemberId: 'm1',
    toMemberId: 'm2',
    label: 'partners',
    isDirected: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

describe('DetailPanel', () => {
  it('renders nothing when selected is null', () => {
    const { container } = render(wrap(
      <DetailPanel
        selected={null}
        members={[member]}
        groups={[]}
        relationships={[]}
        fronterIds={new Set()}
        buckets={[bucket]}
        onClose={vi.fn()}
      />
    ))
    expect(container.firstChild).toBeNull()
  })

  it('renders member name and pronouns', () => {
    render(wrap(
      <DetailPanel
        selected={{ type: 'member', id: 'm1' }}
        members={[member]}
        groups={[]}
        relationships={rels}
        fronterIds={new Set()}
        buckets={[bucket]}
        onClose={vi.fn()}
      />
    ))
    expect(screen.getByText('Mira')).toBeInTheDocument()
    expect(screen.getByText('she/her')).toBeInTheDocument()
  })

  it('shows fronting badge when member is fronting', () => {
    render(wrap(
      <DetailPanel
        selected={{ type: 'member', id: 'm1' }}
        members={[member]}
        groups={[]}
        relationships={[]}
        fronterIds={new Set(['m1'])}
        buckets={[bucket]}
        onClose={vi.fn()}
      />
    ))
    expect(screen.getByText(/fronting/i)).toBeInTheDocument()
  })

  it('renders group name and member count', () => {
    render(wrap(
      <DetailPanel
        selected={{ type: 'group', id: 'g1' }}
        members={[member]}
        groups={[group]}
        relationships={[]}
        fronterIds={new Set()}
        buckets={[bucket]}
        onClose={vi.fn()}
      />
    ))
    expect(screen.getByText('Protectors')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(wrap(
      <DetailPanel
        selected={{ type: 'member', id: 'm1' }}
        members={[member]}
        groups={[]}
        relationships={[]}
        fronterIds={new Set()}
        buckets={[bucket]}
        onClose={onClose}
      />
    ))
    fireEvent.click(screen.getByLabelText('Close panel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(wrap(
      <DetailPanel
        selected={{ type: 'member', id: 'm1' }}
        members={[member]}
        groups={[]}
        relationships={[]}
        fronterIds={new Set()}
        buckets={[bucket]}
        onClose={onClose}
      />
    ))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
