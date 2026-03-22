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
    if (!res.ok) throw res
    return res.json()
  },
}
