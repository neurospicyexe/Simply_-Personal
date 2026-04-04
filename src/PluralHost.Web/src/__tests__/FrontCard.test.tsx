import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import FrontCard from '../components/FrontCard'
import type { FrontStatus } from '../api/frontStatuses'

const STATUSES: FrontStatus[] = [
  { id: 's1', label: 'Present', color: '#b6ff00', isDefault: true, isHidden: false, createdAt: '' },
]

const BASE = {
  entry: { uid: 'e1', member: 'm1', live: true, startTime: Date.now() - 5000, custom: false },
  member: {
    id: 'm1',
    name: 'Kai',
    color: '#b6ff00',
    pronouns: 'they/them',
    bucketId: '00000000-0000-0000-0000-000000000001',
    isArchived: false,
    groupIds: [],
    parentIds: [],
    isPinned: false,
    isUntracked: false,
    preventFrontNotification: false,
    receiveBoardNotifications: false,
    createdAt: '',
    updatedAt: '',
  },
  frontStatuses: [],
  onRemove: vi.fn(),
  onUpdateStatus: vi.fn(),
  onEdit: vi.fn(),
  onUpdateComment: vi.fn(),
}

test('renders member name', () => {
  render(<FrontCard {...BASE} />)
  expect(screen.getByText('Kai')).toBeInTheDocument()
})

test('shows live timer counting seconds', async () => {
  vi.useFakeTimers()
  render(<FrontCard {...BASE} />)
  const timerBefore = screen.getByTestId('live-timer').textContent
  act(() => { vi.advanceTimersByTime(1000) })
  const timerAfter = screen.getByTestId('live-timer').textContent
  expect(timerAfter).not.toBe(timerBefore)
  vi.useRealTimers()
})

test('remove button calls onRemove', async () => {
  render(<FrontCard {...BASE} />)
  await userEvent.click(screen.getByRole('button', { name: /remove/i }))
  expect(BASE.onRemove).toHaveBeenCalledWith('e1')
})

test('collapse toggles compact view', async () => {
  render(<FrontCard {...BASE} />)
  expect(screen.getByText('they/them')).toBeInTheDocument()
  await userEvent.click(screen.getByTestId('card-header'))
  expect(screen.queryByText('they/them')).not.toBeInTheDocument()
})

test('shows placeholder when no status set', () => {
  render(<FrontCard {...BASE} />)
  expect(screen.getByRole('button', { name: /edit status/i })).toBeInTheDocument()
  expect(screen.getByText(/set a status/i)).toBeInTheDocument()
})

test('tapping status button opens picker sheet', async () => {
  render(<FrontCard {...BASE} frontStatuses={STATUSES} />)
  await userEvent.click(screen.getByRole('button', { name: /edit status/i }))
  expect(screen.getByRole('dialog', { name: /set status/i })).toBeInTheDocument()
})

test('selecting a status from sheet calls onUpdateStatus', async () => {
  const onUpdateStatus = vi.fn()
  render(<FrontCard {...BASE} frontStatuses={STATUSES} onUpdateStatus={onUpdateStatus} />)
  await userEvent.click(screen.getByRole('button', { name: /edit status/i }))
  await userEvent.click(screen.getByRole('button', { name: /^present$/i }))
  expect(onUpdateStatus).toHaveBeenCalledWith('e1', 'Present')
})

test('sheet closes after selecting a status', async () => {
  render(<FrontCard {...BASE} frontStatuses={STATUSES} />)
  await userEvent.click(screen.getByRole('button', { name: /edit status/i }))
  await userEvent.click(screen.getByRole('button', { name: /^present$/i }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
