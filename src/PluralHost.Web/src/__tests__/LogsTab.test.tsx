import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import LogsTab from '../components/tabs/LogsTab'
import type { Member } from '../types'

vi.mock('../api/front', () => ({
  frontApi: {
    history: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { frontApi } from '../api/front'

const mockMember: Member = {
  id: 'member-1',
  name: 'Aria',
  bucketId: '00000000-0000-0000-0000-000000000001',
  isArchived: false,
  isUntracked: false,
  isPinned: false,
  preventFrontNotification: false,
  receiveBoardNotifications: false,
  groupIds: [],
  parentIds: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('LogsTab', () => {
  it('shows loading state initially', () => {
    vi.mocked(frontApi.history).mockReturnValue(new Promise(() => {}))
    wrap(<LogsTab member={mockMember} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows empty state when no entries match this member', async () => {
    vi.mocked(frontApi.history).mockResolvedValue([
      { exists: true, id: 'other', content: { uid: 'other', member: 'other-member', live: false, startTime: 1000, custom: false } },
    ])
    wrap(<LogsTab member={mockMember} />)
    await screen.findByText('No front history for this alter.')
  })

  it('renders a matching log card', async () => {
    const now = Date.now()
    vi.mocked(frontApi.history).mockResolvedValue([
      { exists: true, id: 'e1', content: { uid: 'e1', member: 'member-1', live: false, startTime: now - 7200000, endTime: now, custom: false } },
    ])
    wrap(<LogsTab member={mockMember} />)
    await screen.findByText(/2h/)
  })

  it('shows error state when query fails', async () => {
    vi.mocked(frontApi.history).mockRejectedValue(new Error('Network error'))
    wrap(<LogsTab member={mockMember} />)
    await screen.findByText('Failed to load history')
  })
})
