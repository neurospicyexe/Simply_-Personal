import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import FrontCard from '../components/FrontCard'

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
  onRemove: vi.fn(),
  onUpdateStatus: vi.fn(),
  onEdit: vi.fn(),
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
  // Start expanded — pronouns visible
  expect(screen.getByText('they/them')).toBeInTheDocument()
  // Click header to collapse
  await userEvent.click(screen.getByTestId('card-header'))
  // Pronouns hidden in compact view
  expect(screen.queryByText('they/them')).not.toBeInTheDocument()
})
