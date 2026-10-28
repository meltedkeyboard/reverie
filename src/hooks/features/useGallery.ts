import { useCallback, useEffect, useState } from 'react'

import { addToGallery, listGallery, orderGallery, removeFromGallery, setGallerySize, type GalleryItem } from '@/db/gallery'
import { useDatabase } from '@/db/provider'
import { useTranslation } from '@/i18n'
import { pickGalleryItems } from '@/lib/images/gallery'
import type { ImageSource } from '@/lib/images/images'
import { alertError } from '@/lib/transfer/report'

// A character's gallery as the profile shows it. Every change is saved at once, apart from
// the editor's Save: the gallery is a collection of the profile, not a field of the form.
export function useGallery(characterId: number) {
  const db = useDatabase()
  const { t } = useTranslation()
  const [items, setItems] = useState<GalleryItem[]>([])
  const [adding, setAdding] = useState(false)

  const reload = useCallback(() => listGallery(db, characterId).then(setItems), [db, characterId])
  useEffect(() => {
    reload().catch((err) => console.warn('Gallery not loaded', err))
  }, [reload])

  const add = async (source: ImageSource) => {
    try {
      setAdding(true)
      const picked = await pickGalleryItems(source)
      await addToGallery(db, characterId, picked)
      await reload()
    } catch (err) {
      alertError(t('gallery.addFailed'), err)
    } finally {
      setAdding(false)
    }
  }

  const remove = async (item: GalleryItem) => {
    setItems((current) => current.filter((other) => other.id !== item.id))
    try {
      await removeFromGallery(db, item)
    } catch (err) {
      alertError(t('gallery.removeFailed'), err)
      reload()
    }
  }

  // The new order shows at once and is saved behind it.
  const reorder = (from: number, to: number) => {
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setItems(next)
    orderGallery(db, next.map((item) => item.id)).catch((err) => console.warn('Gallery order not saved', err))
  }

  // A video's size, once its first frame has told it, for the viewer to lay it out.
  const measured = (item: GalleryItem, width: number, height: number) => {
    if (!width || !height || (item.width && item.height)) return
    setItems((current) => current.map((other) => (other.id === item.id ? { ...other, width, height } : other)))
    setGallerySize(db, item.id, width, height).catch(() => {})
  }

  return { items, adding, add, remove, reorder, measured }
}
