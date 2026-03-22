import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import MemberDetailPage from '../pages/MemberDetailPage'

vi.mock('../api/members', () => ({
  membersApi: {
    get: vi.fn().mockResolvedValue({
      id: 'm1', name: 'Sage', color: '#b6ff00', pronouns: 'they/them',
      description: 'A test member', bucketId: '00000000-0000-0000-0000-000000000001',
      isArchived: false, groupIds: [], parentIds: [], avatarPath: undefined,
      isPinned: false, isUntracked: false,
      preventFrontNotification: false, receiveBoardNotifications: false,
      createdAt: '', updatedAt: '',
    }),
    update: vi.fn().mockResolvedValue({
      id: 'm1', name: 'Sage Updated', color: '#b6ff00', pronouns: 'they/them',
      description: 'A test member', bucketId: '00000000-0000-0000-0000-000000000001',
      isArchived: false, groupIds: [], parentIds: [], avatarPath: undefined,
      isPinned: false, isUntracked: false,
      preventFrontNotification: false, receiveBoardNotifications: false,
      createdAt: '', updatedAt: '',
    }),
    list: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('../api/groups', () => ({
  groupsApi: {
    list: vi.fn().mockResolvedValue([]),
    setMemberships: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('../api/fields', () => ({
  fieldsApi: {
    listDefs: vi.fn().mockResolvedValue([]),
    getMemberFields: vi.fn().mockResolvedValue([]),
    upsertMemberField: vi.fn(),
    deleteMemberField: vi.fn(),
    createDef: vi.fn(),
  },
}))
vi.mock('../api/notes', () => ({
  notesApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('../api/board', () => ({
  boardApi: {
    list: vi.fn().mockResolvedValue([]),
    post: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('../api/front', () => ({
  frontApi: {
    history: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/members/m1']}>
        <Routes>
          <Route path="/members/:id" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

test('renders member name and pronouns', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  expect(await screen.findByRole('heading', { name: 'Sage' })).toBeInTheDocument()
  expect(screen.getAllByText('they/them').length).toBeGreaterThan(0)
})

test('Essence tab is active by default', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  await screen.findByRole('heading', { name: 'Sage' })
  const essenceTab = screen.getByRole('tab', { name: /essence/i })
  expect(essenceTab).toHaveAttribute('aria-selected', 'true')
})

test('switching to Access tab shows privacy controls', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  await screen.findByRole('heading', { name: 'Sage' })
  await userEvent.click(screen.getByRole('tab', { name: /access/i }))
  expect(screen.getByText(/privacy/i)).toBeInTheDocument()
})

test('all six tabs are rendered', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  await screen.findByRole('heading', { name: 'Sage' })
  expect(screen.getByRole('tab', { name: /essence/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /specs/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /dossier/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /comms/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /access/i })).toBeInTheDocument()
})
