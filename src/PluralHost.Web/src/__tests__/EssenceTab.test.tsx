import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EssenceTab from '../components/tabs/EssenceTab'
import type { Member, Group } from '../types'
import * as mediaApi from '../api/media'
import * as membersApi from '../api/members'

vi.mock('../api/members', () => ({ membersApi: { update: vi.fn() } }))
vi.mock('../api/groups', () => ({ groupsApi: { setMemberships: vi.fn() } }))
vi.mock('../api/media', () => ({
  mediaApi: { upload: vi.fn().mockResolvedValue({ id: 'new-avatar.jpg' }) },
}))

function baseMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-1', name: 'Aria', displayName: 'The Aria', pronouns: 'she/her',
    bucketId: '00000000-0000-0000-0000-000000000001', isArchived: false, isUntracked: false, isPinned: false,
    preventFrontNotification: false, receiveBoardNotifications: false,
    groupIds: ['g1'], parentIds: [],
    backgroundImagePath: null,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const mockMember: Member = baseMember({ id: 'm1', groupIds: ['g1'] })
const mockGroups: Group[] = [{ id: 'g1', name: 'Protectors', memberCount: 1 }]

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

function renderTab(member: Member) {
  return wrap(<EssenceTab member={member} groups={mockGroups} />)
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

describe('EssenceTab Appearance section', () => {
  it('renders Appearance section label', () => {
    renderTab(baseMember())
    expect(screen.getByText(/appearance/i)).toBeInTheDocument()
  })

  it('renders avatar pencil button inside Appearance section', () => {
    renderTab(baseMember())
    expect(screen.getByLabelText('Change avatar')).toBeInTheDocument()
  })

  it('shows add-background-image button when backgroundImagePath is null', () => {
    renderTab(baseMember({ backgroundImagePath: null }))
    expect(screen.getByLabelText('Add background image')).toBeInTheDocument()
  })

  it('shows remove button when backgroundImagePath is set', () => {
    renderTab(baseMember({ backgroundImagePath: 'uploads/bg.jpg' }))
    expect(screen.getByLabelText('Remove background image')).toBeInTheDocument()
  })

  it('upload calls mediaApi.upload then membersApi.update with backgroundImagePath', async () => {
    const uploadSpy = vi.spyOn(mediaApi.mediaApi, 'upload').mockResolvedValue({ id: 'uploads/new.jpg' } as any)
    const updateSpy = vi.spyOn(membersApi.membersApi, 'update').mockResolvedValue(baseMember() as any)
    renderTab(baseMember({ backgroundImagePath: null }))

    const input = screen.getByLabelText('Add background image')
      .parentElement!.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'bg.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith(file))
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('member-1', { backgroundImagePath: 'uploads/new.jpg' }))
  })

  it('remove calls membersApi.update with clearBackgroundImage: true', async () => {
    const updateSpy = vi.spyOn(membersApi.membersApi, 'update').mockResolvedValue(baseMember() as any)
    renderTab(baseMember({ backgroundImagePath: 'uploads/bg.jpg' }))

    fireEvent.click(screen.getByLabelText('Remove background image'))
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('member-1', { clearBackgroundImage: true }))
  })
})
