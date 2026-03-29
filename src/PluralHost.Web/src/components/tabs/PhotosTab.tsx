import { useRef, useState } from 'react'
import type React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mediaApi } from '../../api/media'
import { membersApi } from '../../api/members'
import type { Member } from '../../types'
import BottomSheet from '../BottomSheet'
import styles from './PhotosTab.module.css'

interface Props {
  member: Member
}

export default function PhotosTab({ member }: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [sheetBusy, setSheetBusy] = useState(false)

  const photos = member.extraImages ?? []

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    try {
      const { id } = await mediaApi.upload(file)
      await membersApi.update(member.id, { extraImages: [...photos, id] })
      qc.invalidateQueries({ queryKey: ['member', member.id] })
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSetBackground = async () => {
    if (!selectedPhoto) return
    setSheetBusy(true)
    setSheetError(null)
    try {
      await membersApi.update(member.id, { backgroundImagePath: selectedPhoto })
      qc.invalidateQueries({ queryKey: ['member', member.id] })
      setSelectedPhoto(null)
    } catch {
      setSheetError('Failed to set background. Please try again.')
    } finally {
      setSheetBusy(false)
    }
  }

  const handleDeletePhoto = async () => {
    if (!selectedPhoto) return
    setSheetBusy(true)
    setSheetError(null)
    try {
      await membersApi.update(member.id, {
        extraImages: photos.filter(p => p !== selectedPhoto),
      })
      qc.invalidateQueries({ queryKey: ['member', member.id] })
      setSelectedPhoto(null)
    } catch {
      setSheetError('Delete failed. Please try again.')
    } finally {
      setSheetBusy(false)
    }
  }

  return (
    <div className={styles.tab} role="tabpanel">
      <div className={styles.toolbar}>
        <button
          className={styles.addBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="Add photo"
          type="button"
        >
          {uploading ? '…' : '+ Add photo'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className={styles.hiddenInput}
          onChange={handleFileChange}
        />
      </div>

      {uploadError && <p className={styles.error} role="alert">{uploadError}</p>}

      {photos.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🖼</div>
          <p>No photos yet — add some above</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {photos.map(path => (
            <img
              key={path}
              src={`/api/media/${path}`}
              alt=""
              role="img"
              className={styles.photo}
              onClick={() => { setSheetError(null); setSelectedPhoto(path) }}
            />
          ))}
        </div>
      )}

      <BottomSheet
        isOpen={!!selectedPhoto}
        onClose={() => setSelectedPhoto(null)}
        title="Photo options"
      >
        {selectedPhoto && (
          <div className={styles.sheetContent}>
            <img
              src={`/api/media/${selectedPhoto}`}
              alt="Selected photo"
              className={styles.sheetPreview}
            />
            {sheetError && <p className={styles.error} role="alert">{sheetError}</p>}
            <button
              className={styles.sheetPrimary}
              onClick={handleSetBackground}
              disabled={sheetBusy}
              type="button"
            >
              Set as background
            </button>
            <button
              className={styles.sheetDanger}
              onClick={handleDeletePhoto}
              disabled={sheetBusy}
              type="button"
            >
              Delete photo
            </button>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
