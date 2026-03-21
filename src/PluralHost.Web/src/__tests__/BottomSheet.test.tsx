import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import BottomSheet from '../components/BottomSheet'

describe('BottomSheet', () => {
  it('renders title and children when open', () => {
    render(
      <BottomSheet isOpen={true} onClose={vi.fn()} title="Test Sheet">
        <p>Sheet content</p>
      </BottomSheet>
    )
    expect(screen.getByText('Test Sheet')).toBeInTheDocument()
    expect(screen.getByText('Sheet content')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(
      <BottomSheet isOpen={false} onClose={vi.fn()} title="Test Sheet">
        <p>Sheet content</p>
      </BottomSheet>
    )
    expect(screen.queryByText('Test Sheet')).not.toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <BottomSheet isOpen={true} onClose={onClose} title="Test Sheet">
        <p>content</p>
      </BottomSheet>
    )
    fireEvent.click(screen.getByRole('presentation'))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
