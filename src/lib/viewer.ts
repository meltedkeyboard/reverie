// The picture the viewer screen shows. It goes around the URL because a chat photo is
// a data URL far too long for a route param.
export type ViewerImage = { uri: string; aspect: number }

let pending: ViewerImage | null = null

export function setViewerImage(image: ViewerImage) {
  pending = image
}

export function viewerImage() {
  return pending
}
