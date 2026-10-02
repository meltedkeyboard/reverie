import { File } from 'expo-file-system'

// Animated avatars: a video or a picture that moves. expo-image plays GIF, WebP and APNG
// on its own; MP4, MOV and M4V go through expo-video. WebM isn't playable on iOS.
const VIDEO = ['mp4', 'm4v', 'mov']

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
  return movingFormat(uri) ? 'image' : null
}

// The format of a moving picture, by what the file says it is and not by its name: the
// picker may hand a GIF over under another extension. The extension is only a first guess
// for the formats that always move.
export function movingFormat(uri: string): 'gif' | 'webp' | 'png' | null {
  try {
    const handle = new File(uri).open()
    try {
      const bytes = handle.readBytes(4096)
      const head = String.fromCharCode(...bytes)
      if (head.startsWith('GIF8')) return 'gif'
      if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return head.includes('ANIM') ? 'webp' : null
      if (head.startsWith('PNG')) return head.includes('acTL') ? 'png' : null
      return null
    } finally {
      handle.close()
    }
  } catch {
    // Unreadable (not a plain file): fall back to the name.
    const ext = extensionOf(uri)
    return ext === 'gif' ? 'gif' : null
  }
}
