import type { SQLiteDatabase } from 'expo-sqlite'

import { getAvatarOriginal } from '@/db/characters'
import { avatarUri, cropFromJson, pictureSize } from '@/lib/images/avatars'

// The pictures the viewer screen shows. They go around the URL because a chat photo is
// a data URL far too long for a route param. `avatar` is the file of a stored avatar, by
// which the viewer finds the original it was cut from.
export type ViewerImage = { uri: string; aspect: number; avatar?: string | null }

// The whole picture an avatar was cut from, and where the cut lies in it, in fractions of its
// size.
export type ViewerOriginal = { uri: string; aspect: number; crop: { x: number; y: number; width: number; height: number } }

// The original of a stored avatar, a character's or a persona's, for the viewer to swap in;
// null when there is none, or when it shows hardly more than the avatar does.
export async function findOriginal(db: SQLiteDatabase, avatar: string): Promise<ViewerOriginal | null> {
  try {
    const found = await getAvatarOriginal(db, avatar)
    const uri = found ? avatarUri(found.original) : null
    if (!found || !uri) return null
    const crop = cropFromJson(found.crop)
    // A frame keeps the size of its original; one framed before it did is measured.
    const size = crop?.sourceWidth && crop.sourceHeight ? { width: crop.sourceWidth, height: crop.sourceHeight } : await pictureSize(uri)
    if (!size.width || !size.height) return null
    // No frame is the middle square, as squareAvatar cuts it.
    const side = Math.min(size.width, size.height)
    const rect = crop ?? { originX: (size.width - side) / 2, originY: (size.height - side) / 2, width: side, height: side }
    const cut = { x: rect.originX / size.width, y: rect.originY / size.height, width: rect.width / size.width, height: rect.height / size.height }
    if (cut.width > 0.98 && cut.height > 0.98) return null
    return { uri, aspect: size.width / size.height, crop: cut }
  } catch {
    return null
  }
}

// Where a picture sits in the window as it is tapped, so the viewer grows it out of that place
// and puts it back there on closing: its frame and its corners, top left first and round the
// clock, which are either iOS's continuous curve or circular arcs. The thumbnail shows the
// picture covering that frame, cut to its shape.
export type ViewerOrigin = {
  x: number
  y: number
  width: number
  height: number
  radii: [number, number, number, number]
  continuous: boolean
}

// The corners of a thumbnail: one radius for all, or each its own, as for a picture filling the
// edge of a card, which only the card's corners on that side cut.
export type Corners =
  | number
  | { topLeft?: number; topRight?: number; bottomRight?: number; bottomLeft?: number; continuous?: boolean }

export function originOf(box: { x: number; y: number; width: number; height: number }, corners: Corners = 0): ViewerOrigin {
  if (typeof corners === 'number') return { ...box, radii: [corners, corners, corners, corners], continuous: false }
  const { topLeft = 0, topRight = 0, bottomRight = 0, bottomLeft = 0, continuous = false } = corners
  return { ...box, radii: [topLeft, topRight, bottomRight, bottomLeft], continuous }
}

type Pending = {
  images: ViewerImage[]
  index: number
  // The place of each picture, or null for one not on the screen.
  origins: (ViewerOrigin | null)[]
  // The thumbnail of each picture, which hides while that picture is up (see setLifted), or
  // null for one that stays.
  sources: (string | null)[]
}

let pending: Pending | null = null

// Several pictures are swiped through, starting from `index`: a room's cast, say, or the
// pictures of one message.
export function setViewerImages(images: ViewerImage[], index = 0, origins: (ViewerOrigin | null)[] = [], sources: (string | null)[] = []) {
  pending = images.length ? { images, index: Math.min(Math.max(index, 0), images.length - 1), origins, sources } : null
}

export function viewerImages() {
  return pending
}

// The thumbnail whose picture is up in the viewer hides its own while it is, so the photo looks
// lifted out of the chat rather than copied, and lands back in an empty place.
let lifted: string | null = null
const liftListeners = new Set<() => void>()

export function setLifted(source: string | null) {
  if (lifted === source) return
  lifted = source
  liftListeners.forEach((listener) => listener())
}

export function liftedSource() {
  return lifted
}

export function subscribeLifted(listener: () => void) {
  liftListeners.add(listener)
  return () => {
    liftListeners.delete(listener)
  }
}
