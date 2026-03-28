import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DossierTab from '../components/tabs/DossierTab'
import type { Member } from '../types'

vi.mock('../api/notes', () => ({
  notesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../api/relationships', () => ({
  relationshipsApi: {
    list: vi.fn().mockResolvedValue([]),
    remove: vi.fn(),
  },
}))

vi.mock('../api/members', () => ({
  membersApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

import { notesApi } from '../api/notes'

const mockMember: Member = {
  id: 'member-1', name: 'Aria', bucketId: '00000000-0000-0000-0000-000000000001',
  isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: [], parentIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('DossierTab', () => {
  it('shows loading state', () => {
    vi.mocked(notesApi.list).mockReturnValue(new Promise(() => {}))
    wrap(<DossierTab member={mockMember} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows empty state when no notes', async () => {
    vi.mocked(notesApi.list).mockResolvedValue([])
    wrap(<DossierTab member={mockMember} />)
    await screen.findByText('No notes yet. Use + to add the first one.')
  })

  it('renders note cards', async () => {
    vi.mocked(notesApi.list).mockResolvedValue([
      { id: 'n1', memberId: 'member-1', title: 'First note', content: 'Some content', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ])
    wrap(<DossierTab member={mockMember} />)
    await screen.findByText('First note')
    expect(screen.getByText('Some content')).toBeInTheDocument()
  })

  it('shows error state when query fails', async () => {
    vi.mocked(notesApi.list).mockRejectedValue(new Error('fail'))
    wrap(<DossierTab member={mockMember} />)
    await screen.findByText('Failed to load notes')
  })

  it('opens create sheet when + is clicked', async () => {
    vi.mocked(notesApi.list).mockResolvedValue([])
    wrap(<DossierTab member={mockMember} />)
    await screen.findByText('No notes yet. Use + to add the first one.')
    fireEvent.click(screen.getByRole('button', { name: /add note/i }))
    expect(screen.getByRole('dialog', { name: 'New Note' })).toBeInTheDocument()
  })
})
