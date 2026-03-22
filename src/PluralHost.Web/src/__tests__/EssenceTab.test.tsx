import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EssenceTab from '../components/tabs/EssenceTab'
import type { Member, Group } from '../types'

vi.mock('../api/members', () => ({ membersApi: { update: vi.fn() } }))
vi.mock('../api/groups', () => ({ groupsApi: { setMemberships: vi.fn() } }))
vi.mock('../api/media', () => ({
  mediaApi: { upload: vi.fn().mockResolvedValue({ id: 'new-avatar.jpg' }) },
}))

const mockMember: Member = {
  id: 'm1', name: 'Aria', displayName: 'The Aria', pronouns: 'she/her',
  privacyTier: 'Public', isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: ['g1'], parentIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}
const mockGroups: Group[] = [{ id: 'g1', name: 'Protectors', members: ['m1'] }]

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('EssenceTab', () => {
  it('renders member name and pronouns', () => {
    wrap(<EssenceTab member={mockMember} groups={mockGroups} />)
    expect(screen.getByText('Aria')).toBeInTheDocument()
    expect(screen.getByText('she/her')).toBeInTheDocument()
  })

  it('renders group chip', () => {
    wrap(<EssenceTab member={mockMember} groups={mockGroups} />)
    expect(screen.getByText('Protectors')).toBeInTheDocument()
  })

  it('renders pencil button for avatar upload', () => {
    wrap(<EssenceTab member={mockMember} groups={mockGroups} />)
    expect(screen.getByLabelText(/change avatar/i)).toBeInTheDocument()
  })

  it('has hidden file input for avatar selection', () => {
    const { container } = wrap(<EssenceTab member={mockMember} groups={mockGroups} />)
    const input = container.querySelector('input[type="file"]')
    expect(input).toBeInTheDocument()
  })
})
