import type { CropRect } from '@/lib/images/avatars'

// The framing of a chat background: the original laid out to cover the screen, then moved
// and zoomed under it. All in screen points; the picture sits centered on the screen and is
// transformed from its center, as translate(x, y) then scale(k).

type Size = { width: number; height: number }
export type Transform = { k: number; x: number; y: number }

export const MAX_ZOOM = 4

export const IDENTITY: Transform = { k: 1, x: 0, y: 0 }

// The picture at zoom 1: just large enough to leave no gap on the screen.
export function coverSize(natural: Size, frame: Size): Size {
  const scale = Math.max(frame.width / natural.width, frame.height / natural.height)
  return { width: natural.width * scale, height: natural.height * scale }
}

// How far the picture may move each way before an edge comes into the screen.
export function limits(cover: Size, frame: Size, k: number) {
  'worklet'
  return {
    x: Math.max(0, (cover.width * k - frame.width) / 2),
    y: Math.max(0, (cover.height * k - frame.height) / 2),
  }
}

export function clamp(value: number, min: number, max: number) {
  'worklet'
  return Math.min(max, Math.max(min, value))
}

// Past a bound the value follows the finger less and less, as a scroll view does at its end.
export function rubber(value: number, min: number, max: number, dimension: number) {
  'worklet'
  const pull = (over: number) => (1 - 1 / ((over * 0.55) / dimension + 1)) * dimension
  if (value < min) return min - pull(min - value)
  if (value > max) return max + pull(value - max)
  return value
}

export function isIdentity({ k, x, y }: Transform) {
  'worklet'
  return Math.abs(k - 1) < 0.001 && Math.abs(x) < 0.5 && Math.abs(y) < 0.5
}

// The part of the original the screen shows, so the chat, which covers its screen the same
// way, shows the same part. Null while the picture is left as it is.
export function cropFromTransform(natural: Size, frame: Size, t: Transform): CropRect | null {
  if (isIdentity(t)) return null
  const scale = (coverSize(natural, frame).width / natural.width) * t.k
  const width = Math.min(natural.width, Math.round(frame.width / scale))
  const height = Math.min(natural.height, Math.round(frame.height / scale))
  const originX = clamp(Math.round(natural.width / 2 - t.x / scale - width / 2), 0, natural.width - width)
  const originY = clamp(Math.round(natural.height / 2 - t.y / scale - height / 2), 0, natural.height - height)
  return { originX, originY, width, height }
}

// The inverse, to reopen a stored frame where it was left.
export function transformFromCrop(natural: Size, frame: Size, crop: CropRect): Transform {
  const cover = coverSize(natural, frame)
  const base = cover.width / natural.width
  const k = clamp(frame.width / crop.width / base, 1, MAX_ZOOM)
  const limit = limits(cover, frame, k)
  const scale = base * k
  return {
    k,
    x: clamp((natural.width / 2 - (crop.originX + crop.width / 2)) * scale, -limit.x, limit.x),
    y: clamp((natural.height / 2 - (crop.originY + crop.height / 2)) * scale, -limit.y, limit.y),
  }
}
