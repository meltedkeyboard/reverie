import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { unzlibSync } from 'fflate'
import { useEffect, useState } from 'react'

import { movingKind } from '@/lib/images/media'

// A color as sRGB components from 0 to 255.
export type Rgb = [number, number, number]

// The width the picture is shrunk to before it is averaged: enough pixels that the scaler's
// sampling evens out, few enough to decode in no time.
const SAMPLE = 32

// What each picture measured to, by its uri; null when it could not be (a video). Stored
// pictures get a new name whenever they change, so an entry never goes stale.
const known = new Map<string, Rgb | null>()
const measuring = new Map<string, Promise<Rgb | null>>()

// The average color of a picture, or undefined while it has not been measured yet.
export const knownPictureColor = (uri: string) => known.get(uri)

// The average color of a picture, measured once per uri: shrunk by the system's scaler and
// read back as a PNG. A video has no frame to read here, and gives null.
export function measurePictureColor(uri: string): Promise<Rgb | null> {
  if (known.has(uri)) return Promise.resolve(known.get(uri) ?? null)
  let pending = measuring.get(uri)
  if (!pending) {
    pending = measure(uri)
      .catch(() => null)
      .then((color) => {
        known.set(uri, color)
        measuring.delete(uri)
        return color
      })
    measuring.set(uri, pending)
  }
  return pending
}

// The average color of a picture for a component: what is known at once, then the measure.
export function usePictureColor(uri: string | null): Rgb | null | undefined {
  const [color, setColor] = useState(() => (uri ? knownPictureColor(uri) : null))
  useEffect(() => {
    if (!uri) {
      setColor(null)
      return
    }
    let live = true
    setColor(knownPictureColor(uri))
    measurePictureColor(uri).then((next) => {
      if (live) setColor(next)
    })
    return () => {
      live = false
    }
  }, [uri])
  return color
}

async function measure(uri: string): Promise<Rgb | null> {
  if (movingKind(uri) === 'video') return null
  const small = await ImageManipulator.manipulate(uri).resize({ width: SAMPLE }).renderAsync()
  const { base64 } = await small.saveAsync({ format: SaveFormat.PNG, base64: true })
  return base64 ? averagePng(bytesOf(base64)) : null
}

function bytesOf(base64: string) {
  const raw = atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

// Channels per pixel by PNG color type: grey, RGB, grey with alpha, RGBA. Palette images
// (type 3) are not written by the scaler.
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 }

// The mean color of a non-interlaced 8 or 16 bit PNG, its alpha left aside. Only what a
// scaler writes is read: the header, the data chunks, and the row filters undone.
function averagePng(png: Uint8Array): Rgb | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  let width = 0
  let height = 0
  let depth = 0
  let type = 0
  let interlaced = false
  const data: Uint8Array[] = []
  for (let at = 8; at + 8 <= png.length; ) {
    const length = view.getUint32(at)
    const name = String.fromCharCode(png[at + 4], png[at + 5], png[at + 6], png[at + 7])
    const body = png.subarray(at + 8, at + 8 + length)
    if (name === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      depth = body[8]
      type = body[9]
      interlaced = body[12] !== 0
    } else if (name === 'IDAT') data.push(body)
    else if (name === 'IEND') break
    at += 12 + length
  }
  const channels = CHANNELS[type]
  if (!width || !height || !channels || interlaced || (depth !== 8 && depth !== 16)) return null

  const joined = new Uint8Array(data.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of data) {
    joined.set(part, offset)
    offset += part.length
  }
  const pixels = unzlibSync(joined)
  const step = (channels * depth) / 8
  const stride = width * step
  let previous = new Uint8Array(stride)
  const sums = [0, 0, 0]
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1)
    const filter = pixels[start]
    const row = pixels.slice(start + 1, start + 1 + stride)
    for (let i = 0; i < stride; i++) {
      const left = i >= step ? row[i - step] : 0
      const up = previous[i]
      const corner = i >= step ? previous[i - step] : 0
      if (filter === 1) row[i] += left
      else if (filter === 2) row[i] += up
      else if (filter === 3) row[i] += (left + up) >> 1
      else if (filter === 4) row[i] += paeth(left, up, corner)
    }
    // A 16 bit sample is read by its high byte, which is all a mean needs.
    for (let x = 0; x < width; x++) {
      const p = x * step
      const at = (channel: number) => row[p + (channel * depth) / 8]
      if (channels <= 2) {
        const grey = at(0)
        sums[0] += grey
        sums[1] += grey
        sums[2] += grey
      } else {
        sums[0] += at(0)
        sums[1] += at(1)
        sums[2] += at(2)
      }
    }
    previous = row
  }
  const count = width * height
  return [sums[0] / count, sums[1] / count, sums[2] / count]
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}
