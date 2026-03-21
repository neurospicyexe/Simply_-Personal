import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AccessTab from '../components/tabs/AccessTab'
import type { Member } from '../types'

vi.mock('../api/members', () => ({ membersApi: { update: vi.fn() } }))

const mockMember: Member = {
  id: 'm1', name: 'Aria', privacyTier: 'Public',
  isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: [], parentIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient()
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('AccessTab', () => {
  it('renders privacy tier selector', () => {
    wrap(<AccessTab member={mockMember} />)
    expect(screen.getByText(/privacy/i)).toBeInTheDocument()
  })

  it('renders toggle switches', () => {
    wrap(<AccessTab member={mockMember} />)
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
  })
})
