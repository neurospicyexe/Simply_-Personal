import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import MemberDetailPage from '../pages/MemberDetailPage'
import * as membersApiModule from '../api/members'
import * as groupsApiModule from '../api/groups'
import * as frontApiModule from '../api/front'

vi.mock('../api/members', () => ({
  membersApi: {
    get: vi.fn().mockResolvedValue({
      id: 'm1', name: 'Sage', color: '#b6ff00', pronouns: 'they/them',
      description: 'A test member', bucketId: '00000000-0000-0000-0000-000000000001',
      isArchived: false, groupIds: [], parentIds: [], avatarPath: undefined, backgroundImagePath: undefined,
      isPinned: false, isUntracked: false,
      preventFrontNotification: false, receiveBoardNotifications: false,
      createdAt: '', updatedAt: '', extraImages: [],
    }),
    update: vi.fn().mockResolvedValue({
      id: 'm1', name: 'Sage Updated', color: '#b6ff00', pronouns: 'they/them',
      description: 'A test member', bucketId: '00000000-0000-0000-0000-000000000001',
      isArchived: false, groupIds: [], parentIds: [], avatarPath: undefined, backgroundImagePath: undefined,
      isPinned: false, isUntracked: false,
      preventFrontNotification: false, receiveBoardNotifications: false,
      createdAt: '', updatedAt: '', extraImages: [],
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
    getCurrent: vi.fn().mockResolvedValue([]),
    history: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('../api/secure', () => ({
  secureApi: {
    status: vi.fn().mockResolvedValue({ pinIsSet: false, deletionCooldownEnd: null }),
  },
}))
vi.mock('../api/buckets', () => ({
  bucketsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  PUBLIC_BUCKET_ID: '00000000-0000-0000-0000-000000000001',
  FRIEND_BUCKET_ID: '00000000-0000-0000-0000-000000000002',
  TRUSTED_BUCKET_ID: '00000000-0000-0000-0000-000000000003',
  PRIVATE_BUCKET_ID: '00000000-0000-0000-0000-000000000004',
}))
vi.mock('../api/relationships', () => ({
  relationshipsApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('../api/media', () => ({
  mediaApi: { upload: vi.fn().mockResolvedValue({ id: 'uploads/new.jpg' }) },
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

test('all seven tabs are rendered', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  await screen.findByRole('heading', { name: 'Sage' })
  expect(screen.getByRole('tab', { name: /essence/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /specs/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /dossier/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /comms/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /logs/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /access/i })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /photos/i })).toBeInTheDocument()
})

test('switching to Photos tab shows empty state', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  await screen.findByRole('heading', { name: 'Sage' })
  await userEvent.click(screen.getByRole('tab', { name: /photos/i }))
  expect(screen.getByText(/no photos yet/i)).toBeInTheDocument()
})

function buildMember(overrides = {}) {
  return {
    id: 'member-1',
    name: 'Nyx',
    color: '#b400ff',
    avatarPath: undefined,
    backgroundImagePath: undefined,
    pronouns: 'she/her',
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
    extraImages: [],
    ...overrides,
  }
}

function renderPage(member: ReturnType<typeof buildMember>) {
  vi.mocked(membersApiModule.membersApi.get).mockResolvedValue(member as any)
  vi.mocked(groupsApiModule.groupsApi.list).mockResolvedValue([])
  vi.mocked(frontApiModule.frontApi.getCurrent).mockResolvedValue([])
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/members/member-1']}>
        <Routes>
          <Route path="/members/:id" element={<MemberDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('MemberDetailPage hero', () => {
  it('sets --member-color CSS var from member.color', async () => {
    const { container } = renderPage(buildMember({ color: '#b400ff' }))
    await screen.findByText('Nyx')
    const page = container.firstElementChild as HTMLElement
    expect(page.style.getPropertyValue('--member-color')).toBe('#b400ff')
  })

  it('sets --member-bg-image to none when backgroundImagePath is null', async () => {
    const { container } = renderPage(buildMember({ backgroundImagePath: null }))
    await screen.findByText('Nyx')
    const page = container.firstElementChild as HTMLElement
    expect(page.style.getPropertyValue('--member-bg-image')).toBe('none')
  })

  it('sets --member-bg-image to url when backgroundImagePath is set', async () => {
    const { container } = renderPage(buildMember({ backgroundImagePath: 'uploads/bg.jpg' }))
    await screen.findByText('Nyx')
    const page = container.firstElementChild as HTMLElement
    expect(page.style.getPropertyValue('--member-bg-image')).toBe('url("/api/media/uploads/bg.jpg")')
  })

  it('renders member name and pronouns in the hero', async () => {
    renderPage(buildMember())
    expect(await screen.findByText('Nyx')).toBeInTheDocument()
    expect(screen.getAllByText('she/her').length).toBeGreaterThan(0)
  })
})
