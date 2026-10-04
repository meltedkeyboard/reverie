import { useRef, useState } from 'react'

import {
  avatarUri,
  cropFromJson,
  cropToJson,
  persistAvatar,
  persistOriginal,
  removeAvatar,
  type CropRect,
  type ImageKind,
} from '@/lib/avatars'

// What a picture is made of once stored: the shown copy, the original beside it and the
// frame between them, as JSON.
export type SlotValue = { file: string | null; original: string | null; crop: string | null }

// A picture being edited, an avatar or a background. A fresh pick is kept apart as temporary
// files until Save, while the stored files stay as they are; the slot also remembers which
// stored files there were, so the ones a save replaces can be removed afterwards.
export function useImageSlot(kind: ImageKind) {
  const [uri, setUri] = useState<string | null>(null)
  const [originalUri, setOriginalUri] = useState<string | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const stored = useRef<Pick<SlotValue, 'file' | 'original'>>({ file: null, original: null })

  // The stored files as they were loaded, or as they were last saved.
  const remember = ({ file, original }: Pick<SlotValue, 'file' | 'original'>) => {
    stored.current = { file, original }
  }

  // The picture now shown: a fresh pick, else the one already stored.
  const shown = (file: string | null) => uri ?? (file ? avatarUri(file, kind) : null)

  // A framed copy came back from its own screen. `original` is the temporary file to store
  // beside it, or null when the stored original was reframed.
  const setFramed = (framed: string, rect: CropRect | null, original: string | null) => {
    setUri(framed)
    setCrop(rect)
    if (original) setOriginalUri(original)
  }

  // A picture that is shown as it is, without a frame and without an original.
  const setUnframed = (file: string) => {
    setUri(file)
    setOriginalUri(null)
    setCrop(null)
  }

  const clearPicked = () => {
    setUri(null)
    setOriginalUri(null)
    setCrop(null)
  }

  // What the frame is redone on: the original, and an image saved before originals were
  // kept has only its shown copy, which then becomes the original.
  const adjustSource = (value: SlotValue) => {
    if (originalUri) return { uri: originalUri, crop, original: null }
    if (value.original) return { uri: avatarUri(value.original, kind)!, crop: cropFromJson(value.crop), original: null }
    const current = shown(value.file)
    return current ? { uri: current, crop: null, original: current } : null
  }

  // The files to write to the database: the fresh pick moved into the store, else what is stored.
  const persist = async (value: SlotValue): Promise<SlotValue> => ({
    file: uri ? await persistAvatar(uri, kind) : value.file,
    original: originalUri ? await persistOriginal(originalUri, kind) : value.original,
    crop: uri ? cropToJson(crop) : value.crop,
  })

  // Once the database holds `next`, the files it no longer uses are deleted.
  const settle = (next: SlotValue) => {
    const { file, original } = stored.current
    if (file && file !== next.file) removeAvatar(file, kind)
    if (original && original !== next.original) removeAvatar(original, kind)
    remember(next)
    clearPicked()
  }

  const removeStored = () => {
    const { file, original } = stored.current
    if (file) removeAvatar(file, kind)
    if (original) removeAvatar(original, kind)
  }

  return { uri, shown, remember, setFramed, setUnframed, clearPicked, adjustSource, persist, settle, removeStored }
}
