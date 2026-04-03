import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import StatusPickerSheet from '../components/StatusPickerSheet'
import type { FrontStatus } from '../api/frontStatuses'

const STATUSES: FrontStatus[] = [
  { id: 's1', label: 'Present', color: '#b6ff00', isDefault: true, isHidden: false, createdAt: '' },
  { id: 's2', label: 'Co-con', color: '#00d4ff', isDefault: false, isHidden: false, createdAt: '' },
  { id: 's3', label: 'Hidden', color: null, isDefault: false, isHidden: true, createdAt: '' },
]

const BASE = {
  isOpen: true,
  currentStatus: '',
  statuses: STATUSES,
  onSelect: vi.fn(),
  onClose: vi.fn(),
}

test('renders nothing when closed', () => {
  render(<StatusPickerSheet {...BASE} isOpen={false} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('shows None and visible statuses only', () => {
  render(<StatusPickerSheet {...BASE} />)
  expect(screen.getByRole('button', { name: /^none$/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^present$/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^co-con$/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^hidden$/i })).not.toBeInTheDocument()
})

test('selecting a predefined status calls onSelect and onClose', async () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(<StatusPickerSheet {...BASE} onSelect={onSelect} onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: /^present$/i }))
  expect(onSelect).toHaveBeenCalledWith('Present')
  expect(onClose).toHaveBeenCalled()
})

test('selecting None calls onSelect with empty string', async () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(<StatusPickerSheet {...BASE} onSelect={onSelect} onClose={onClose} />)
  await userEvent.click(screen.getByRole('button', { name: /^none$/i }))
  expect(onSelect).toHaveBeenCalledWith('')
  expect(onClose).toHaveBeenCalled()
})

test('typing freetext and clicking Set calls onSelect', async () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(<StatusPickerSheet {...BASE} onSelect={onSelect} onClose={onClose} />)
  await userEvent.type(screen.getByLabelText(/custom status/i), 'Tired')
  await userEvent.click(screen.getByRole('button', { name: /^set$/i }))
  expect(onSelect).toHaveBeenCalledWith('Tired')
  expect(onClose).toHaveBeenCalled()
})

test('Set button disabled when freetext is empty', () => {
  render(<StatusPickerSheet {...BASE} />)
  expect(screen.getByRole('button', { name: /^set$/i })).toBeDisabled()
})

test('pressing Enter in freetext calls onSelect', async () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(<StatusPickerSheet {...BASE} onSelect={onSelect} onClose={onClose} />)
  await userEvent.type(screen.getByLabelText(/custom status/i), 'Tired{Enter}')
  expect(onSelect).toHaveBeenCalledWith('Tired')
  expect(onClose).toHaveBeenCalled()
})

test('freetext pre-filled when current status is custom', () => {
  render(<StatusPickerSheet {...BASE} currentStatus="Sleepy" />)
  expect(screen.getByLabelText<HTMLInputElement>(/custom status/i).value).toBe('Sleepy')
})
