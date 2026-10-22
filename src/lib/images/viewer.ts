// The pictures the viewer screen shows. They go around the URL because a chat photo is
// a data URL far too long for a route param.
export type ViewerImage = { uri: string; aspect: number }

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
  // The thumbnail that hides while its picture is up, see setLifted.
  source: string | null
}

let pending: Pending | null = null

// Several pictures are swiped through, starting from `index`: a room's cast, say.
export function setViewerImages(images: ViewerImage[], index = 0, origins: (ViewerOrigin | null)[] = [], source: string | null = null) {
  pending = images.length ? { images, index: Math.min(Math.max(index, 0), images.length - 1), origins, source } : null
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
