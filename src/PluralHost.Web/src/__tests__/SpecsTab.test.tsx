import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SpecsTab from '../components/tabs/SpecsTab'
import type { Member } from '../types'

vi.mock('../api/fields', () => ({
  fieldsApi: {
    listDefs: vi.fn(),
    createDef: vi.fn(),
    getMemberFields: vi.fn(),
    upsertMemberField: vi.fn(),
    deleteMemberField: vi.fn(),
  },
}))
import { fieldsApi } from '../api/fields'

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

describe('SpecsTab', () => {
  it('shows loading state', () => {
    vi.mocked(fieldsApi.listDefs).mockReturnValue(new Promise(() => {}))
    vi.mocked(fieldsApi.getMemberFields).mockReturnValue(new Promise(() => {}))
    wrap(<SpecsTab member={mockMember} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows empty state when no field defs exist', async () => {
    vi.mocked(fieldsApi.listDefs).mockResolvedValue([])
    vi.mocked(fieldsApi.getMemberFields).mockResolvedValue([])
    wrap(<SpecsTab member={mockMember} />)
    await screen.findByText('No specs defined yet. Use + to add the first one.')
  })

  it('renders a field row with its value', async () => {
    vi.mocked(fieldsApi.listDefs).mockResolvedValue([
      { id: 'f1', label: 'Role', fieldType: 0, sortOrder: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null },
    ])
    vi.mocked(fieldsApi.getMemberFields).mockResolvedValue([
      { fieldId: 'f1', label: 'Role', fieldType: 0, sortOrder: 0, value: 'Protector', privacyTier: 'Public' },
    ])
    wrap(<SpecsTab member={mockMember} />)
    await screen.findByText('Role')
    expect(screen.getByText('Protector')).toBeInTheDocument()
  })

  it('hides soft-deleted field defs', async () => {
    vi.mocked(fieldsApi.listDefs).mockResolvedValue([
      { id: 'f1', label: 'Role', fieldType: 0, sortOrder: 0, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null },
      { id: 'f2', label: 'OldField', fieldType: 0, sortOrder: 1, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: '2026-02-01T00:00:00Z' },
    ])
    vi.mocked(fieldsApi.getMemberFields).mockResolvedValue([])
    wrap(<SpecsTab member={mockMember} />)
    await screen.findByText('Role')
    expect(screen.queryByText('OldField')).not.toBeInTheDocument()
  })

  it('shows error state when query fails', async () => {
    vi.mocked(fieldsApi.listDefs).mockRejectedValue(new Error('fail'))
    vi.mocked(fieldsApi.getMemberFields).mockResolvedValue([])
    wrap(<SpecsTab member={mockMember} />)
    await screen.findByText('Failed to load fields')
  })
})
