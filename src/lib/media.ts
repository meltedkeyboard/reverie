import { File } from 'expo-file-system'

// Animated avatars: a video or a picture that moves. expo-image plays GIF, WebP and APNG
// on its own; MP4, MOV and M4V go through expo-video. WebM isn't playable on iOS.
const VIDEO = ['mp4', 'm4v', 'mov']
const MOVING_PICTURE = ['gif', 'webp', 'png', 'apng']

// Kept as they are, not recompressed, and also stored in backups as base64, so they are
// capped.
export const MAX_ANIMATED_BYTES = 15 * 1024 * 1024

export function extensionOf(uri: string) {
  const path = uri.split(/[?#]/)[0]
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase()
}

export const isVideo = (uri: string) => VIDEO.includes(extensionOf(uri))

// What a picked file is: 'video', 'image' (a picture that animates), or null for a still
// picture that should be cropped like any photo.
export function movingKind(uri: string): 'video' | 'image' | null {
  const ext = extensionOf(uri)
  if (VIDEO.includes(ext)) return 'video'
  if (ext === 'gif') return 'image'
  if (MOVING_PICTURE.includes(ext)) return hasAnimationChunk(uri, ext) ? 'image' : null
  return null
}

// WebP and PNG share their extension with still pictures, so the header says which one
// moves: an `ANIM` chunk in a WebP, an `acTL` chunk in a PNG, both near the start.
function hasAnimationChunk(uri: string, ext: string) {
  try {
    const handle = new File(uri).open()
    try {
      const head = String.fromCharCode(...handle.readBytes(4096))
      return ext === 'webp' ? head.includes('ANIM') : head.includes('acTL')
    } finally {
      handle.close()
    }
  } catch {
    return false
  }
}
