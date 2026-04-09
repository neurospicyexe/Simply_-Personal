// Note: do NOT set Content-Type for multipart — the browser sets it with boundary
export const mediaApi = {
  upload: async (file: File): Promise<{ id: string }> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/media/upload', {
      method: 'POST',
      body: form,
      credentials: 'include',
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      throw new Error(body?.error ?? `Upload failed (${res.status})`)
    }
    return res.json()
  },
}
