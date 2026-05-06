import { useEffect, useState } from 'react'
import { localAssetUrl } from './asset'

export function useAssetImage(assetPath: string | null | undefined) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!assetPath) {
      setImage(null)
      setSize({ width: 0, height: 0 })
      return
    }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      setImage(img)
      setSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      if (!cancelled) {
        setImage(null)
        setSize({ width: 0, height: 0 })
      }
    }
    img.src = assetPath.startsWith('data:') ? assetPath : localAssetUrl(assetPath)
    return () => { cancelled = true }
  }, [assetPath])

  return { image, size }
}
