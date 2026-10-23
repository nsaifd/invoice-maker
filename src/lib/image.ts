/** Shrinks an uploaded image (logo, signature) to at most `max` px and returns it as a PNG data URL. */
export function resizeImage(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Could not read image'))
    img.src = url
  })
}

/** A photo or screenshot as a JPEG data URL small enough to upload (under `maxBytes`). */
export async function compressImage(file: File, maxBytes = 440_000): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read image'))
      el.src = url
    })
    for (const [side, quality] of [[1400, 0.8], [1100, 0.7], [800, 0.6], [600, 0.5]] as const) {
      const scale = Math.min(1, side / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const data = canvas.toDataURL('image/jpeg', quality)
      if (data.length <= maxBytes) return data
    }
    throw new Error('This image is too large. Try a smaller screenshot.')
  } finally {
    URL.revokeObjectURL(url)
  }
}
