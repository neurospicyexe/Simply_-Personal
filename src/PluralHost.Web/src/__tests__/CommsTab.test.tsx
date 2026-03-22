import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CommsTab from '../components/tabs/CommsTab'
import type { Member } from '../types'

vi.mock('../api/board', () => ({
  boardApi: { list: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
import { boardApi } from '../api/board'

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

describe('CommsTab', () => {
  it('shows loading state', () => {
    vi.mocked(boardApi.list).mockReturnValue(new Promise(() => {}))
    wrap(<CommsTab member={mockMember} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows empty state', async () => {
    vi.mocked(boardApi.list).mockResolvedValue([])
    wrap(<CommsTab member={mockMember} />)
    await screen.findByText('No messages yet.')
  })

  it('renders message cards newest first', async () => {
    vi.mocked(boardApi.list).mockResolvedValue([
      { id: 'm1', memberId: 'member-1', authorName: 'Cypher', content: 'First post', createdAt: '2026-01-01T10:00:00Z' },
      { id: 'm2', memberId: 'member-1', authorName: 'Drevan', content: 'Second post', createdAt: '2026-01-02T10:00:00Z' },
    ])
    wrap(<CommsTab member={mockMember} />)
    await screen.findByText('Drevan') // newest first
    const names = screen.getAllByText(/Cypher|Drevan/).map(el => el.textContent)
    expect(names[0]).toBe('Drevan')
  })

  it('shows error state', async () => {
    vi.mocked(boardApi.list).mockRejectedValue(new Error('fail'))
    wrap(<CommsTab member={mockMember} />)
    await screen.findByText('Failed to load messages')
  })
})
