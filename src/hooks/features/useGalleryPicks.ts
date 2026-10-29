import { useEffect, useState } from 'react'

import { listGallery, type GalleryItem } from '@/db/gallery'
import { useDatabase } from '@/db/provider'
import { isGalleryVideo } from '@/lib/images/gallery'

// A saved character's gallery to pick from, none for a new one. Videos are offered only
// where they can be used, as behind a chat.
export function useGalleryPicks(characterId: number | null | undefined, videos = false) {
  const db = useDatabase()
  const [items, setItems] = useState<GalleryItem[]>([])
  useEffect(() => {
    if (characterId == null) return
    listGallery(db, characterId)
      .then((all) => setItems(videos ? all : all.filter((item) => !isGalleryVideo(item.file))))
      .catch((err) => console.warn('Gallery not loaded', err))
  }, [db, characterId, videos])
  return items
}
