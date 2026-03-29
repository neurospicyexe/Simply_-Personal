import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PhotosTab from '../components/tabs/PhotosTab'
import type { Member } from '../types'
import * as mediaApiModule from '../api/media'
import * as membersApiModule from '../api/members'

vi.mock('../api/media', () => ({
  mediaApi: { upload: vi.fn().mockResolvedValue({ id: 'uploads/new.jpg' }) },
}))
vi.mock('../api/members', () => ({
  membersApi: { update: vi.fn().mockResolvedValue({}) },
}))

function baseMember(overrides: Partial<Member> = {}): Member {
  return {
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
    ...overrides,
  }
}

function wrap(member: Member) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PhotosTab member={member} />
    </QueryClientProvider>
  )
}

describe('PhotosTab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows empty state when extraImages is empty', () => {
    wrap(baseMember({ extraImages: [] }))
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument()
  })

  it('shows empty state when extraImages is undefined', () => {
    wrap(baseMember({ extraImages: undefined }))
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument()
  })

  it('renders photo grid when extraImages has items', () => {
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg', 'uploads/photo2.jpg'] }))
    const imgs = screen.getAllByRole('img')
    expect(imgs).toHaveLength(2)
  })

  it('renders Add photo button', () => {
    wrap(baseMember({ extraImages: [] }))
    expect(screen.getByLabelText('Add photo')).toBeInTheDocument()
  })

  it('tapping a photo opens BottomSheet with actions', () => {
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg'] }))
    fireEvent.click(screen.getAllByRole('img')[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Set as background')).toBeInTheDocument()
    expect(screen.getByText('Delete photo')).toBeInTheDocument()
  })

  it('Set as background calls membersApi.update with backgroundImagePath', async () => {
    const updateSpy = vi.spyOn(membersApiModule.membersApi, 'update').mockResolvedValue(baseMember() as any)
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg'] }))
    fireEvent.click(screen.getAllByRole('img')[0])
    fireEvent.click(screen.getByText('Set as background'))
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('member-1', { backgroundImagePath: 'uploads/photo1.jpg' })
    })
  })

  it('Delete calls membersApi.update with photo removed from array', async () => {
    const updateSpy = vi.spyOn(membersApiModule.membersApi, 'update').mockResolvedValue(baseMember() as any)
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg', 'uploads/photo2.jpg'] }))
    fireEvent.click(screen.getAllByRole('img')[0])
    fireEvent.click(screen.getByText('Delete photo'))
    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('member-1', { extraImages: ['uploads/photo2.jpg'] })
    })
  })

  it('shows upload error when mediaApi.upload fails', async () => {
    vi.spyOn(mediaApiModule.mediaApi, 'upload').mockRejectedValue(new Error('fail'))
    wrap(baseMember({ extraImages: [] }))
    const input = document.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => {
      expect(screen.getByText(/upload failed/i)).toBeInTheDocument()
    })
  })

  it('shows sheet error when delete fails', async () => {
    vi.spyOn(membersApiModule.membersApi, 'update').mockRejectedValue(new Error('fail'))
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg'] }))
    fireEvent.click(screen.getAllByRole('img')[0])
    fireEvent.click(screen.getByText('Delete photo'))
    await waitFor(() => {
      expect(screen.getByText(/delete failed/i)).toBeInTheDocument()
    })
  })

  it('shows sheet error when set background fails', async () => {
    vi.spyOn(membersApiModule.membersApi, 'update').mockRejectedValue(new Error('fail'))
    wrap(baseMember({ extraImages: ['uploads/photo1.jpg'] }))
    fireEvent.click(screen.getAllByRole('img')[0])
    fireEvent.click(screen.getByText('Set as background'))
    await waitFor(() => {
      expect(screen.getByText(/failed to set background/i)).toBeInTheDocument()
    })
  })
})
