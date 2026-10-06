// The pictures the viewer screen shows. They go around the URL because a chat photo is
// a data URL far too long for a route param.
export type ViewerImage = { uri: string; aspect: number }

type Pending = { images: ViewerImage[]; index: number }

let pending: Pending | null = null

// Several pictures are swiped through, starting from `index`: a room's cast, say.
export function setViewerImages(images: ViewerImage[], index = 0) {
  pending = images.length ? { images, index: Math.min(Math.max(index, 0), images.length - 1) } : null
}

export function viewerImages() {
  return pending
}
