import { Image } from 'expo-image'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { StyleSheet, View, type ViewInstance } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets'

import { Picture } from '@/components/visuals/Picture'
import { isWeb } from '@/lib/core/platform'
import type { ViewerImage, ViewerOrigin, ViewerOriginal } from '@/lib/images/viewer'
import { FILL, useColors } from '@/theme'

import { clamp, glide, project, resist, rubberband, spring, unresist, unrubberband } from './motion'

// Between two pictures side by side.
const GAP = 20
// How far a touch goes before it is a drag rather than a tap.
const SLOP = 10
// A double tap zooms to where the picture fills the screen, and at least this far; a pinch
// goes half as far again, and never less far than MAX_ZOOM.
const TAP_ZOOM = 2
const MAX_ZOOM = 4
// A picture pinched below this and let go closes, as in Photos.
const PINCH_CLOSE = 0.75
// How far a picture pulled away must be headed, of the screen's height, to close.
const THROW = 0.2
// Responses of the springs, in seconds: the strip of pictures, a zoom settling, the picture
// growing out of its thumbnail and going back, a pull flung back into the thumbnail, one let
// go short of closing, and the original of an avatar opening out of it or closing back in.
const PAGE_RESPONSE = 0.32
const ZOOM_RESPONSE = 0.35
const MORPH_RESPONSE = 0.36
const FLING_RESPONSE = 0.42
const RETURN_RESPONSE = 0.32
const SWAP_RESPONSE = 0.4
// Off by less than this many points, a picture flying back is in its thumbnail.
const LANDED = 0.4
const FADE = { duration: 200, easing: Easing.out(Easing.quad) }
// A picture deleted shrinks by this much as it fades, and the one coming in grows from it.
const VANISH_SHRINK = 0.08

// What a drag does, settled as it starts.
const NONE = 0
const PAGE = 1 // turns to the picture beside
const PAN = 2 // moves a zoomed picture, and past its edge the strip
const PULL = 3 // pulls the picture away to close it
const HOLD = 4 // two fingers have the picture and the pinch moves it

type Size = { width: number; height: number }
type Fit = Size & { tap: number; max: number }

// The picture's frame on its page, fitted into the screen, and how far it zooms.
function fitIn(aspect: number, width: number, height: number): Fit {
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 1
  const w = Math.min(width, height * ratio)
  const h = w / ratio
  const tap = Math.max(TAP_ZOOM, width / w, height / h)
  return { width: w, height: h, tap, max: Math.max(MAX_ZOOM, tap * 1.5) }
}

type Frame = { x: number; y: number; width: number; height: number }

// How the picture lies on its thumbnail: its middle's offset from the middle of the screen, the
// scale at which it covers the thumbnail, the thumbnail's corners (each of its own, as a card cuts
// only those on its edge) and, for a thumbnail of another shape, the part of the picture it
// shows, the last two in the picture's own size.
type Morph = {
  x: number
  y: number
  scale: number
  radii: [number, number, number, number]
  continuous: boolean
  crop: Size | null
}

function morphFrom(origin: ViewerOrigin | null, fit: Fit, frame: Frame): Morph | null {
  if (!origin || origin.width <= 0 || origin.height <= 0) return null
  const scale = Math.max(origin.width / fit.width, origin.height / fit.height)
  const sameShape = Math.abs(origin.width / origin.height / (fit.width / fit.height) - 1) < 0.01
  const [topLeft, topRight, bottomRight, bottomLeft] = origin.radii
  return {
    x: origin.x - frame.x + origin.width / 2 - frame.width / 2,
    y: origin.y - frame.y + origin.height / 2 - frame.height / 2,
    scale,
    radii: [topLeft / scale, topRight / scale, bottomRight / scale, bottomLeft / scale],
    continuous: origin.continuous,
    crop: sameShape ? null : { width: origin.width / scale, height: origin.height / scale },
  }
}

// How the whole original an avatar was cut from lies on its page: on a frame of its own,
// fitted into the screen, or around the avatar's frame with the cut covering it (its size,
// and its middle's offset from the frame's middle); and where the cut is in it, in fractions
// of its size.
type Whole = {
  uri: string
  fit: Fit
  around: Size & { x: number; y: number }
  crop: ViewerOriginal['crop']
}

function wholeFrom(original: ViewerOriginal, fit: Fit, width: number, height: number): Whole {
  const { crop } = original
  // Sized by the width alone, so a cut a hair off the avatar's own shape doesn't stretch it.
  const aroundWidth = fit.width / crop.width
  const aroundHeight = aroundWidth / original.aspect
  return {
    uri: original.uri,
    fit: fitIn(original.aspect, width, height),
    around: {
      width: aroundWidth,
      height: aroundHeight,
      x: (0.5 - crop.x - crop.width / 2) * aroundWidth,
      y: (0.5 - crop.y - crop.height / 2) * aroundHeight,
    },
    crop,
  }
}

// What of a page shows and where, in its frame's own size and from the middle of the page:
// the window the picture shows through, the avatar in it and the whole original under the
// avatar. As `u` goes to 1 the original opens out of the avatar: the window widens from the
// avatar's frame to the original's while the original settles into it, the cut keeping to
// the avatar. As `k` goes to 1 everything heads for the thumbnail: the window closes to the
// part of the avatar the thumbnail shows (`cut`), and the original folds back into the
// avatar, which is what the thumbnail shows. Each goes in a straight line between those
// places, and so the window never leaves the original.
function shapeOf(fit: Fit, whole: Whole | null, cut: Size | null, u: number, k: number) {
  'worklet'
  const openWidth = whole ? fit.width + (whole.fit.width - fit.width) * u : fit.width
  const openHeight = whole ? fit.height + (whole.fit.height - fit.height) * u : fit.height
  const window = {
    width: openWidth + ((cut ? cut.width : fit.width) - openWidth) * k,
    height: openHeight + ((cut ? cut.height : fit.height) - openHeight) * k,
  }
  if (!whole) return { window, avatar: { x: 0, y: 0, scale: 1, opacity: 1 }, original: null }
  const out = u * (1 - k)
  const { around, crop } = whole
  const width = around.width + (whole.fit.width - around.width) * out
  const height = around.height + (whole.fit.height - around.height) * out
  const x = around.x * (1 - out)
  const y = around.y * (1 - out)
  return {
    window,
    // The avatar lies on its cut of the original and gives way to it as it comes out: the two
    // are the same picture there, the avatar only a smaller copy.
    avatar: {
      x: x + (crop.x + crop.width / 2 - 0.5) * width,
      y: y + (crop.y + crop.height / 2 - 0.5) * height,
      scale: (crop.width * width) / fit.width,
      opacity: 1 - out,
    },
    original: { x, y, scale: width / whole.fit.width },
  }
}

// The zoom past its limits gives like a rubber band, in steps of the zoom itself, so a pinch
// past the largest feels like one below the smallest; below, it gives more readily, toward
// the pinch that closes.
function resistZoom(raw: number, max: number) {
  'worklet'
  if (raw > max) return max * Math.exp(rubberband(Math.log(raw / max), 0.5))
  if (raw < 1) return Math.exp(rubberband(Math.log(raw), 2))
  return raw
}

// The pinch that resistZoom() turned into `scale`, for one that catches the picture while
// it springs back into range.
function unresistZoom(scale: number, max: number) {
  'worklet'
  if (scale > max) return max * Math.exp(unrubberband(Math.log(scale / max), 0.5))
  if (scale < 1) return Math.exp(unrubberband(Math.log(scale), 2))
  return scale
}

type Motion = {
  progress: SharedValue<number>
  page: SharedValue<number>
  zoomPage: SharedValue<number>
  scale: SharedValue<number>
  x: SharedValue<number>
  y: SharedValue<number>
  pullX: SharedValue<number>
  pullY: SharedValue<number>
  kickX: SharedValue<number>
  kickY: SharedValue<number>
  uncrop: SharedValue<number>
  vanish: SharedValue<number>
}

export type GalleryHandle = {
  // Closes as the button does: back into the thumbnail, or fading.
  close: () => void
  // Turns to the picture beside, -1 or 1.
  go: (step: number) => void
  // Opens the original of the avatar shown out of it, or closes it back in.
  toggleOriginal: () => void
  // Takes the picture shown away (see `remove` in the motion).
  remove: () => void
}

type Props = {
  images: ViewerImage[]
  initialIndex: number
  // Where each picture sits on the screen under the viewer (null for one not there), to grow
  // out of and go back into.
  origins: (ViewerOrigin | null)[]
  // The whole original each avatar was cut from, as the viewer finds them (none for a picture
  // without one), which the avatar can be swapped for in place.
  originals: (ViewerOriginal | null | undefined)[]
  // The viewer's place in the window and its size, the size of a page.
  frame: Frame
  // The bars over the pictures, brought in and out with them and by a tap. They move out of
  // sight, the top one by `topTravel` and the bottom one by `bottomTravel`, rather than fade:
  // either may hold glass, which never fades.
  top: ReactNode
  bottom: ReactNode
  topTravel: number
  bottomTravel: number
  onIndexChange: (index: number) => void
  onChromeChange: (shown: boolean) => void
  // The original of picture `index` has loaded and can be swapped in, or has gone with its page.
  onOriginalLoad: (index: number, loaded: boolean) => void
  // The picture shown is the original of its avatar now, or the avatar again.
  onOriginalChange: (shown: boolean) => void
  // The picture has gone: the viewer can.
  onClosed: () => void
  // Picture `index`, taken away, has faded out: the viewer takes it out of `images`, and the
  // gallery brings in the one now in its place. With none left the viewer closes instead.
  onRemoved?: (index: number) => void
  ref?: Ref<GalleryHandle>
}

// Full-screen pictures to swipe through, zoom and pull away, the way the viewers of Photos
// and Twitter go. One set of gestures on the UI thread drives it all: a drag turns to the
// picture beside, pulls the picture away to close, or moves a zoomed one, whose edge hands
// the drag on to the strip; pinches zoom around the fingers and give past the limits, a
// double tap zooms to the point, a tap shows or hides the bars. Let go, everything carries
// the finger's speed on (see motion.ts). A picture grows out of its place on the screen and
// goes back into it, cut to the thumbnail's shape on the way. An avatar can be swapped in
// place for the whole original it was cut from, which opens out of it, and which folds back
// into it on the way to the thumbnail.
export function Gallery({
  images,
  initialIndex,
  origins,
  originals,
  frame,
  top,
  bottom,
  topTravel,
  bottomTravel,
  onIndexChange,
  onChromeChange,
  onOriginalLoad,
  onOriginalChange,
  onClosed,
  onRemoved,
  ref,
}: Props) {
  const colors = useColors()
  const { width, height } = frame
  const stride = width + GAP
  const lastPage = images.length - 1
  const fits = useMemo(() => images.map((image) => fitIn(image.aspect, width, height)), [images, width, height])
  // The originals of avatars on their pages, as the viewer finds them.
  const wholes = useMemo(
    () =>
      images.map((_, i) => {
        const original = originals[i]
        return original ? wholeFrom(original, fits[i], width, height) : null
      }),
    [images, originals, fits, width, height]
  )
  // The thumbnails are where they were only while the screen keeps the size it was tapped at.
  const opened = useRef({ width, height })
  const sameSize = opened.current.width === width && opened.current.height === height
  const morphs = useMemo(
    () => images.map((_, i) => (sameSize ? morphFrom(origins[i] ?? null, fits[i], frame) : null)),
    [images, sameSize, origins, fits, frame]
  )
  const [current, setCurrent] = useState(initialIndex)

  // 0 on the thumbnail (or not in yet), 1 open.
  const progress = useSharedValue(0)
  // The backdrop, which goes with a picture thrown off the screen.
  const shade = useSharedValue(1)
  const closing = useSharedValue(false)
  // On its way back into its thumbnail.
  const landing = useSharedValue(false)
  // The picture the gestures act on, and how far the strip of pictures has moved.
  const page = useSharedValue(initialIndex)
  const pager = useSharedValue(initialIndex * stride)
  // The zoom, and the picture it belongs to: it is let go once another one has come in.
  const zoomPage = useSharedValue(initialIndex)
  const scale = useSharedValue(1)
  const x = useSharedValue(0)
  const y = useSharedValue(0)
  // How far the original of the avatar the zoom is on has opened out of it, and whether it is
  // to be out. It goes back in with the zoom.
  const uncrop = useSharedValue(0)
  const showsOriginal = useSharedValue(false)
  // How far the picture shown has gone, taken away: 1 while it is out of sight, until the one
  // that takes its place has come in.
  const vanish = useSharedValue(0)
  // The place of the picture taken away, until `images` comes back without it.
  const removing = useRef<number | null>(null)
  const removed = useCallback(
    (at: number) => {
      removing.current = at
      onRemoved?.(at)
    },
    [onRemoved]
  )
  // A picture pulled away to close, and the throw of one let go. A spring Reanimated starts
  // with a speed away from its target sets off without it, so a picture let go is two springs
  // added up, as a spring's motion is: one from where it is, at rest, and one from nothing with
  // the finger's speed, whose target is where it starts.
  const pullX = useSharedValue(0)
  const pullY = useSharedValue(0)
  const kickX = useSharedValue(0)
  const kickY = useSharedValue(0)
  // The bars: how far in, and what the last tap asked for.
  const bars = useSharedValue(0)
  const barsWanted = useSharedValue(true)
  // A touch caught the picture flying back: the tap it makes is no tap on the picture.
  const caught = useSharedValue(false)
  // The gestures' own bookkeeping: what the drag does, where it set off from, how far the
  // fingers have gone since (without the jumps of a finger put down or lifted), and where
  // they last were, from the middle of the page, for a zoom to settle around.
  const mode = useSharedValue(NONE)
  const panning = useSharedValue(false)
  const pinching = useSharedValue(false)
  const start = useSharedValue({ pager: 0, x: 0, y: 0 })
  const moved = useSharedValue({ x: 0, y: 0 })
  const panLast = useSharedValue({ x: 0, y: 0, pointers: 0 })
  const pinchLast = useSharedValue({ scale: 1, x: 0, y: 0, pointers: 0 })
  const rawScale = useSharedValue(1)
  const focal = useSharedValue({ x: 0, y: 0 })

  const turned = useCallback(
    (to: number, original: boolean) => {
      setCurrent(to)
      onIndexChange(to)
      onOriginalChange(original)
    },
    [onIndexChange, onOriginalChange]
  )

  const motion = useMemo(() => {
    // The middle of the page shown, in the gallery: off the screen's middle while the strip moves.
    const middleX = () => {
      'worklet'
      return page.value * stride - pager.value + width / 2
    }

    // The frame a picture zooms and is pulled by: an avatar's, or its original's once that is
    // to be out.
    const fitOf = (p: number) => {
      'worklet'
      const whole = wholes[p]
      return whole && showsOriginal.value && zoomPage.value === p ? whole.fit : fits[p]
    }

    // How far a picture zoomed to `s` may move each way before an edge comes off the screen's.
    const bounds = (p: number, s: number) => {
      'worklet'
      const fit = fitOf(p)
      return { x: Math.max(0, (fit.width * s - width) / 2), y: Math.max(0, (fit.height * s - height) / 2) }
    }

    // The zoom goes with the picture now shown, and so does an original out of its avatar; the
    // picture left behind is off the screen.
    const claimZoom = () => {
      'worklet'
      if (zoomPage.value === page.value) return
      scale.value = 1
      x.value = 0
      y.value = 0
      uncrop.value = 0
      showsOriginal.value = false
      zoomPage.value = page.value
    }

    const showBars = (shown: boolean) => {
      'worklet'
      bars.value = withTiming(shown ? 1 : 0, FADE)
    }

    // The strip goes to picture `to` at the speed it was flung, though never so fast that it
    // swings past and shows the gap beside: a spring that doesn't overshoot sets off no faster
    // than its frequency times the way to go.
    const turnTo = (to: number, velocity: number) => {
      'worklet'
      const distance = to * stride - pager.value
      const reach = ((2 * Math.PI) / PAGE_RESPONSE) * Math.abs(distance)
      const speed =
        Math.abs(distance) < 0.5
          ? 0
          : Math.sign(velocity) === Math.sign(distance)
            ? Math.sign(velocity) * Math.min(Math.abs(velocity), reach)
            : velocity
      pager.value = withSpring(to * stride, spring(PAGE_RESPONSE, 1, speed), (finished) => {
        if (finished) claimZoom()
      })
      if (to !== page.value) {
        page.value = to
        // Back on the picture before the strip has come to rest, its original is still out.
        scheduleOnRN(turned, to, showsOriginal.value && zoomPage.value === to)
      }
    }

    // A swipe let go: to the picture nearest where the flick would carry the strip, one at most.
    const settlePager = (velocity: number) => {
      'worklet'
      const from = page.value
      const rest = pager.value - project(velocity)
      turnTo(clamp(Math.round(rest / stride), Math.max(from - 1, 0), Math.min(from + 1, lastPage)), -velocity)
    }

    // The pull goes back to nothing, carrying on first the way it was flung (see kickX).
    const throwBack = (response: number, vx: number, vy: number) => {
      'worklet'
      const settle = spring(response, 0.85)
      pullX.value = withSpring(0, settle)
      pullY.value = withSpring(0, settle)
      kickX.value = withSpring(0, spring(response, 0.85, vx))
      kickY.value = withSpring(0, spring(response, 0.85, vy))
    }

    // Closes by the button, the back key, a pinch or a pull let go: back into its place on the
    // screen, with whatever was done to it undone on the way. A pull's speed carries on, so the
    // picture runs on the way it was flung, swings round and lands in its thumbnail; the viewer
    // goes as it lands (see `landing`). With no place to go back to it fades where it is.
    const close = (vx = 0, vy = 0) => {
      'worklet'
      if (closing.value) return
      closing.value = true
      showBars(false)
      if (!morphs[page.value]) {
        progress.value = withTiming(0, FADE, (finished) => {
          if (finished) scheduleOnRN(onClosed)
        })
        return
      }
      const back = spring(MORPH_RESPONSE)
      scale.value = withSpring(1, back)
      x.value = withSpring(0, back)
      y.value = withSpring(0, back)
      // Softer than the rest and a little bouncy, being thrown: the fling shows before it turns.
      throwBack(FLING_RESPONSE, vx, vy)
      progress.value = withSpring(0, back)
      landing.value = true
    }

    // Where the picture is on the screen now, as a box around its middle: a touch inside it
    // catches it on its way back.
    const onPicture = (px: number, py: number) => {
      'worklet'
      const p = page.value
      const morph = morphs[p]
      if (!morph) return false
      const own = zoomPage.value === p
      const k = 1 - progress.value
      const s = (1 + (morph.scale - 1) * k) * (own ? scale.value : 1)
      const { window } = shapeOf(fits[p], wholes[p], morph.crop, own ? clamp(uncrop.value, 0, 1) : 0, k)
      const w = window.width * s
      const h = window.height * s
      const cx = middleX() + morph.x * k + pullX.value + kickX.value + (own ? x.value : 0)
      const cy = height / 2 + morph.y * k + pullY.value + kickY.value + (own ? y.value : 0)
      return Math.abs(px - cx) <= w / 2 + SLOP && Math.abs(py - cy) <= h / 2 + SLOP
    }

    // Caught on its way back into the thumbnail: it opens again from wherever it was, and a drag
    // that follows takes it up as any pull.
    const catchBack = () => {
      'worklet'
      landing.value = false
      closing.value = false
      caught.value = true
      progress.value = withSpring(1, spring(MORPH_RESPONSE))
      showBars(barsWanted.value)
    }

    // Thrown away up or down with no place to go back to: it flies on off the screen at the
    // finger's speed, or briskly if that was slow, and the backdrop goes with it.
    const throwAway = (vx: number, vy: number, direction: number) => {
      'worklet'
      closing.value = true
      showBars(false)
      const p = page.value
      const tall = fitOf(p).height * (zoomPage.value === p ? scale.value : 1)
      const target = direction * (height / 2 + tall / 2 + 40)
      const speed = Math.max(Math.abs(vy), 1400)
      const duration = clamp((Math.abs(target - pullY.value) / speed) * 1000, 120, 320)
      const flight = { duration, easing: Easing.linear }
      pullY.value = withTiming(target, flight)
      pullX.value = withTiming(pullX.value + (vx * duration) / 1000, flight)
      shade.value = withTiming(0, flight, (finished) => {
        if (finished) scheduleOnRN(onClosed)
      })
    }

    // A pulled picture let go: headed far enough off, and not flicked back, it closes, into its
    // thumbnail or else off the screen; otherwise it springs back into place with the speed it
    // was let go at.
    const letGo = (vx: number, vy: number) => {
      'worklet'
      const rest = pullY.value + project(vy)
      const flickedBack = Math.abs(vy) > 100 && Math.sign(vy) !== Math.sign(pullY.value)
      if (Math.abs(rest) > height * THROW && !flickedBack) {
        if (morphs[page.value]) close(vx, vy)
        else throwAway(vx, vy, Math.sign(rest))
        return
      }
      throwBack(RETURN_RESPONSE, vx, vy)
      showBars(barsWanted.value)
    }

    // A zoomed picture let go. Pinched well below its size, it closes; a strip pulled past the
    // picture's edge goes on to the picture beside or back; a zoom out of range springs back
    // into it around where the fingers were; and a picture moved within it coasts on and
    // bounces off its edges.
    const settleZoom = (vx: number, vy: number) => {
      'worklet'
      const p = page.value
      const s = scale.value
      if (s < PINCH_CLOSE) {
        close()
        return
      }
      const pulledStrip = Math.abs(pager.value - p * stride) > 0.5
      if (pulledStrip) settlePager(vx)
      const target = clamp(s, 1, fitOf(p).max)
      if (target !== s) {
        const f = focal.value
        const k = target / s
        const b = bounds(p, target)
        const settle = spring(ZOOM_RESPONSE)
        scale.value = withSpring(target, settle)
        x.value = withSpring(clamp(f.x + (x.value - f.x) * k, -b.x, b.x), settle)
        y.value = withSpring(clamp(f.y + (y.value - f.y) * k, -b.y, b.y), settle)
        return
      }
      const b = bounds(p, s)
      if (!pulledStrip) glide(x, vx, -b.x, b.x)
      glide(y, vy, -b.y, b.y)
    }

    // The zoomed picture follows the finger and gives past its edges. Sideways, a pull past its
    // edge moves the strip instead, toward the picture beside, as in Photos; past the first
    // or the last picture it gives like the other way.
    const panZoomed = (mx: number, my: number) => {
      'worklet'
      const p = page.value
      const b = bounds(p, scale.value)
      y.value = resist(start.value.y + my, -b.y, b.y, height)
      const want = start.value.x + mx
      const over = want > b.x ? want - b.x : want < -b.x ? want + b.x : 0
      const beside = over > 0 ? p > 0 : over < 0 ? p < lastPage : false
      if (beside) {
        x.value = want - over
        pager.value = start.value.pager - over
      } else {
        x.value = resist(want, -b.x, b.x, width)
        pager.value = start.value.pager
      }
    }

    // What a drag does, from where it first went: a zoomed picture moves; otherwise sideways
    // turns the pictures and up or down pulls the picture away. With one picture there is
    // nothing to turn to, so any drag pulls it. Whatever was moving is caught where it is.
    const begin = (dx: number, dy: number) => {
      'worklet'
      claimZoom()
      if (scale.value > 1.01) {
        cancelAnimation(x)
        cancelAnimation(y)
        cancelAnimation(pager)
        mode.value = PAN
        start.value = { pager: pager.value, x: x.value, y: y.value }
      } else if (lastPage > 0 && Math.abs(dx) > Math.abs(dy)) {
        cancelAnimation(pager)
        mode.value = PAGE
        start.value = { pager: unresist(pager.value, 0, lastPage * stride, width), x: 0, y: 0 }
      } else {
        cancelAnimation(pullX)
        cancelAnimation(pullY)
        cancelAnimation(kickX)
        cancelAnimation(kickY)
        mode.value = PULL
        start.value = { pager: pager.value, x: pullX.value + kickX.value, y: pullY.value + kickY.value }
        pullX.value = start.value.x
        pullY.value = start.value.y
        kickX.value = 0
        kickY.value = 0
        showBars(false)
      }
    }

    const pan = Gesture.Pan()
      .minDistance(SLOP)
      // Android follows the first finger otherwise; iOS always takes the middle of them.
      .averageTouches(true)
      // A touch on the picture flying back into its thumbnail catches it, as it comes down.
      .onTouchesDown((e) => {
        const touch = e.changedTouches[0]
        if (landing.value && touch && onPicture(touch.x, touch.y)) catchBack()
      })
      .onStart((e) => {
        // A drag, so the touch that caught the picture won't end in a tap.
        caught.value = false
        panning.value = true
        panLast.value = { x: e.translationX, y: e.translationY, pointers: e.numberOfPointers }
        moved.value = { x: 0, y: 0 }
        if (closing.value) mode.value = NONE
        else if (pinching.value) mode.value = HOLD
        else begin(e.translationX, e.translationY)
      })
      .onUpdate((e) => {
        // A finger put down or lifted moves the middle of the touches the translation follows,
        // which is no movement of the hand.
        const before = panLast.value
        const same = e.numberOfPointers === before.pointers
        const dx = same ? e.translationX - before.x : 0
        const dy = same ? e.translationY - before.y : 0
        panLast.value = { x: e.translationX, y: e.translationY, pointers: e.numberOfPointers }
        if (closing.value || mode.value === NONE) return
        if (mode.value === HOLD) {
          if (pinching.value) return
          // The pinch is over and a finger stays on: it goes on moving the picture from here.
          claimZoom()
          mode.value = PAN
          start.value = { pager: pager.value, x: x.value, y: y.value }
          moved.value = { x: 0, y: 0 }
          return
        }
        const m = { x: moved.value.x + dx, y: moved.value.y + dy }
        moved.value = m
        if (mode.value === PAGE) {
          pager.value = resist(start.value.pager - m.x, 0, lastPage * stride, width)
        } else if (mode.value === PULL) {
          pullX.value = start.value.x + m.x
          pullY.value = start.value.y + m.y
        } else {
          focal.value = { x: e.x - middleX(), y: e.y - height / 2 }
          panZoomed(m.x, m.y)
        }
      })
      .onEnd((e) => {
        const was = mode.value
        mode.value = NONE
        panning.value = false
        if (closing.value) return
        if (was === PAGE) settlePager(e.velocityX)
        else if (was === PULL) letGo(e.velocityX, e.velocityY)
        // Holding, it settles only if the pinch has ended first and left that to the drag.
        else if (was === PAN || (was === HOLD && !pinching.value)) settleZoom(e.velocityX, e.velocityY)
      })
      .onFinalize(() => {
        panning.value = false
        mode.value = NONE
      })

    const pinch = Gesture.Pinch()
      .onStart((e) => {
        // A swipe to the picture beside or a pull to close goes on; a second finger doesn't
        // turn it into a zoom.
        if (closing.value || mode.value === PAGE || mode.value === PULL) return
        pinching.value = true
        if (mode.value === PAN) mode.value = HOLD
        claimZoom()
        cancelAnimation(scale)
        cancelAnimation(x)
        cancelAnimation(y)
        rawScale.value = unresistZoom(scale.value, fitOf(page.value).max)
        pinchLast.value = { scale: e.scale, x: e.focalX, y: e.focalY, pointers: e.numberOfPointers }
        focal.value = { x: e.focalX - middleX(), y: e.focalY - height / 2 }
      })
      .onUpdate((e) => {
        if (!pinching.value) return
        const before = pinchLast.value
        pinchLast.value = { scale: e.scale, x: e.focalX, y: e.focalY, pointers: e.numberOfPointers }
        // With a finger more or fewer the middle of the fingers jumps, and the pinch with it.
        if (e.numberOfPointers !== before.pointers) return
        rawScale.value *= e.scale / before.scale
        const next = resistZoom(rawScale.value, fitOf(page.value).max)
        const k = next / scale.value
        const middle = middleX()
        const fx = e.focalX - middle
        const fy = e.focalY - height / 2
        // The point under the fingers stays under them as they move and spread.
        x.value = fx + (x.value - (before.x - middle)) * k
        y.value = fy + (y.value - (before.y - height / 2)) * k
        scale.value = next
        focal.value = { x: fx, y: fy }
      })
      .onEnd(() => {
        if (!pinching.value) return
        pinching.value = false
        // The last fingers to come off settle the picture: one still down goes on moving it.
        if (!closing.value && !panning.value) settleZoom(0, 0)
      })
      .onFinalize(() => {
        pinching.value = false
      })

    // Zoomed out, a double tap zooms in to fill the screen with the point tapped staying under
    // the finger as far as the edges let it; zoomed in, back out.
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDistance(SLOP)
      .maxDelay(250)
      .onEnd((e, success) => {
        if (!success || closing.value) return
        if (caught.value) {
          caught.value = false
          return
        }
        claimZoom()
        const settle = spring(ZOOM_RESPONSE)
        if (scale.value > 1.01) {
          scale.value = withSpring(1, settle)
          x.value = withSpring(0, settle)
          y.value = withSpring(0, settle)
          return
        }
        const p = page.value
        const s = fitOf(p).tap
        const b = bounds(p, s)
        scale.value = withSpring(s, settle)
        x.value = withSpring(clamp((e.x - middleX()) * (1 - s), -b.x, b.x), settle)
        y.value = withSpring(clamp((e.y - height / 2) * (1 - s), -b.y, b.y), settle)
      })

    const singleTap = Gesture.Tap()
      .maxDistance(SLOP)
      .onEnd((_e, success) => {
        if (!success || closing.value) return
        if (caught.value) {
          caught.value = false
          return
        }
        barsWanted.value = !barsWanted.value
        showBars(barsWanted.value)
        scheduleOnRN(onChromeChange, barsWanted.value)
      })

    // The arrows on the desktop.
    const go = (step: number) => {
      'worklet'
      if (closing.value || mode.value !== NONE) return
      const to = clamp(page.value + step, 0, lastPage)
      if (to !== page.value) turnTo(to, 0)
    }

    // The button over an avatar: the whole original it was cut from opens out of it where it
    // is, or closes back into it, and any zoom is let go on the way. Not while a finger is
    // moving a picture.
    const toggleOriginal = () => {
      'worklet'
      if (closing.value || mode.value !== NONE || !wholes[page.value]) return
      claimZoom()
      const shown = !showsOriginal.value
      showsOriginal.value = shown
      const settle = spring(SWAP_RESPONSE)
      uncrop.value = withSpring(shown ? 1 : 0, settle)
      scale.value = withSpring(1, settle)
      x.value = withSpring(0, settle)
      y.value = withSpring(0, settle)
      scheduleOnRN(onOriginalChange, shown)
    }

    // A wheel or a touchpad on the desktop: with Ctrl (as a touchpad pinch comes) it zooms
    // around the pointer, otherwise it moves a zoomed picture. True when it was taken.
    const wheel = (dx: number, dy: number, zoom: boolean, px: number, py: number) => {
      'worklet'
      if (closing.value) return true
      claimZoom()
      const p = page.value
      if (zoom) {
        const s = scale.value
        const next = clamp(s * Math.exp(-clamp(dy, -40, 40) * 0.01), 1, fitOf(p).max)
        const k = next / s
        const fx = px - middleX()
        const fy = py - height / 2
        const b = bounds(p, next)
        x.value = clamp(fx + (x.value - fx) * k, -b.x, b.x)
        y.value = clamp(fy + (y.value - fy) * k, -b.y, b.y)
        scale.value = next
        return true
      }
      if (scale.value <= 1.01) return false
      const b = bounds(p, scale.value)
      x.value = clamp(x.value - dx, -b.x, b.x)
      y.value = clamp(y.value - dy, -b.y, b.y)
      return true
    }

    // The bin under a picture of a character's gallery: the picture shrinks a little and fades
    // where it is, as in Photos, and once it is out of sight the viewer takes it out of the
    // pictures (see arrive). The last one goes with the backdrop, and the viewer closes.
    const remove = () => {
      'worklet'
      if (closing.value || mode.value !== NONE) return
      closing.value = true
      const at = page.value
      if (lastPage === 0) {
        showBars(false)
        shade.value = withTiming(0, FADE)
      }
      vanish.value = withTiming(1, FADE, (finished) => {
        if (finished) scheduleOnRN(removed, at)
      })
    }

    // With the picture taken away out of the pictures, the one that took its place, or the one
    // before it at the end, comes in where it was, growing as the other shrank, unzoomed. Until
    // now `vanish` has kept whatever page stood there out of sight.
    const arrive = (to: number) => {
      'worklet'
      cancelAnimation(pager)
      page.value = to
      pager.value = to * stride
      zoomPage.value = to
      scale.value = 1
      x.value = 0
      y.value = 0
      uncrop.value = 0
      showsOriginal.value = false
      pullX.value = 0
      pullY.value = 0
      kickX.value = 0
      kickY.value = 0
      closing.value = false
      vanish.value = withTiming(0, FADE)
    }

    // After a turn of the screen the pages are laid out again at the picture shown, unzoomed.
    // One closing has nowhere to land any more, and goes at once.
    const relayout = () => {
      'worklet'
      if (closing.value) {
        landing.value = false
        scheduleOnRN(onClosed)
        return
      }
      cancelAnimation(pager)
      pager.value = page.value * stride
      // The zoom comes to the picture shown, and an original out of another goes back in; one
      // out of this picture stays out, laid out again with the rest.
      claimZoom()
      scale.value = 1
      x.value = 0
      y.value = 0
      pullX.value = 0
      pullY.value = 0
      kickX.value = 0
      kickY.value = 0
    }

    return {
      gesture: Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap)),
      close,
      go,
      wheel,
      relayout,
      toggleOriginal,
      remove,
      arrive,
    }
  }, [width, height, stride, lastPage, fits, morphs, wholes, turned, onChromeChange, onOriginalChange, onClosed, removed])

  useImperativeHandle(
    ref,
    () => ({
      close: () => scheduleOnUI(motion.close),
      go: (step: number) => scheduleOnUI(motion.go, step),
      toggleOriginal: () => scheduleOnUI(motion.toggleOriginal),
      remove: () => scheduleOnUI(motion.remove),
    }),
    [motion]
  )

  // The pictures have come back without the one taken away: the one in its place comes in.
  useEffect(() => {
    const at = removing.current
    if (at === null || !images.length) return
    removing.current = null
    const to = Math.min(at, images.length - 1)
    setCurrent(to)
    scheduleOnUI(motion.arrive, to)
  }, [images, motion])

  // Opens: out of the thumbnail, or fading in where there is none to come from.
  useEffect(() => {
    progress.value = morphs[initialIndex] ? withSpring(1, spring(MORPH_RESPONSE)) : withTiming(1, FADE)
    bars.value = withTiming(1, FADE)
    // Only as it first comes up.
  }, [])

  // The flight back has landed once nothing of the picture is off by more than a fraction of a
  // point: its place, its size, and the cut and corners that come in with `progress`. The
  // springs would run on for most of a second more to come to rest by the book, and all that
  // while the viewer, still over the screen, would take the next tap.
  useAnimatedReaction(
    () => {
      if (!landing.value) return false
      const p = page.value
      const morph = morphs[p]
      if (!morph) return false
      const own = zoomPage.value === p
      const left = progress.value
      // An original out of its avatar folds back into it with `progress` too, from a frame
      // of its own.
      const whole = own && uncrop.value > 0 ? wholes[p] : null
      const side = Math.max(fits[p].width, fits[p].height, whole ? Math.max(whole.fit.width, whole.fit.height) : 0)
      const offX = Math.abs(pullX.value + kickX.value + (own ? x.value : 0) - morph.x * left)
      const offY = Math.abs(pullY.value + kickY.value + (own ? y.value : 0) - morph.y * left)
      const size = Math.abs((1 + (morph.scale - 1) * (1 - left)) * (own ? scale.value : 1) - morph.scale) * side
      return Math.max(offX, offY) + size + left * side * morph.scale < LANDED
    },
    (landed) => {
      if (!landed || !landing.value) return
      landing.value = false
      scheduleOnRN(onClosed)
    },
    [morphs, fits, wholes, onClosed]
  )

  const laidOut = useRef({ width, height })
  useEffect(() => {
    if (laidOut.current.width === width && laidOut.current.height === height) return
    laidOut.current = { width, height }
    scheduleOnUI(motion.relayout)
  }, [width, height, motion])

  // The wheel and the touchpad on the desktop. A sideways swipe of the touchpad, unzoomed,
  // turns to the picture beside, once a swipe.
  const surface = useRef<ViewInstance>(null)
  useEffect(() => {
    if (!isWeb) return
    const node = surface.current as unknown as HTMLElement | null
    if (!node) return
    let swiped = 0
    let quiet: ReturnType<typeof setTimeout> | undefined
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const box = node.getBoundingClientRect()
      if (motion.wheel(e.deltaX, e.deltaY, e.ctrlKey, e.clientX - box.left, e.clientY - box.top)) return
      clearTimeout(quiet)
      quiet = setTimeout(() => (swiped = 0), 200)
      if (swiped === Infinity) return
      swiped += e.deltaX
      if (Math.abs(swiped) > 60) {
        motion.go(Math.sign(swiped))
        swiped = Infinity
      }
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      node.removeEventListener('wheel', onWheel)
      clearTimeout(quiet)
    }
  }, [motion])

  const motionValues = { progress, page, zoomPage, scale, x, y, pullX, pullY, kickX, kickY, uncrop, vanish }

  // Each picture keeps its page, known by the picture itself rather than by its place, so a
  // page that moves up a place when one before it is taken away doesn't load its picture again
  // nor show the one taken away while the other loads.
  const pageKeys = useRef({ keys: new WeakMap<ViewerImage, number>(), next: 0 })
  const keyOf = (image: ViewerImage) => {
    const known = pageKeys.current.keys.get(image)
    if (known !== undefined) return known
    const key = pageKeys.current.next++
    pageKeys.current.keys.set(image, key)
    return key
  }

  // The backdrop, in the theme's background, clears as the picture is pulled away or pinched
  // small, which shows the screen underneath, and goes with the picture when it closes.
  const backdrop = useAnimatedStyle(() => {
    const pulled = 1 - Math.min(1, Math.abs(pullY.value + kickY.value) / (height * 0.4))
    const own = zoomPage.value === page.value
    const shrunk = own && scale.value < 1 ? interpolate(scale.value, [PINCH_CLOSE, 1], [0.35, 1], 'clamp') : 1
    return { opacity: progress.value * shade.value * pulled * shrunk }
  })
  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: -pager.value }] }))
  const topBar = useAnimatedStyle(() => ({ transform: [{ translateY: -(1 - bars.value) * topTravel }] }))
  const bottomBar = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - bars.value) * bottomTravel }] }))

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.backdrop, { backgroundColor: colors.bg }, backdrop]} pointerEvents="none" />
      <GestureDetector gesture={motion.gesture}>
        <View ref={surface} style={StyleSheet.absoluteFill} collapsable={false}>
          <Animated.View style={[styles.strip, { width: stride * images.length, height }, strip]}>
            {images.map((image, i) =>
              Math.abs(i - current) <= 2 ? (
                <Page
                  key={keyOf(image)}
                  index={i}
                  image={image}
                  fit={fits[i]}
                  left={i * stride}
                  width={width}
                  height={height}
                  morph={morphs[i]}
                  whole={wholes[i]}
                  motion={motionValues}
                  onOriginalLoad={onOriginalLoad}
                />
              ) : null
            )}
          </Animated.View>
        </View>
      </GestureDetector>
      <Animated.View style={[styles.top, topBar]} pointerEvents="box-none">
        {top}
      </Animated.View>
      {bottom ? (
        <Animated.View style={[styles.bottom, bottomBar]} pointerEvents="box-none">
          {bottom}
        </Animated.View>
      ) : null}
    </View>
  )
}

type PageProps = {
  index: number
  image: ViewerImage
  fit: Fit
  left: number
  width: number
  height: number
  morph: Morph | null
  whole: Whole | null
  motion: Motion
  onOriginalLoad: (index: number, loaded: boolean) => void
}

// One picture on the strip. Its frame carries the zoom, the pull and the flight between the
// thumbnail and the page; inside it the clip shows the whole picture, or on that flight the part
// a thumbnail of another shape shows, with the thumbnail's corners. An avatar cut from an
// original has the original under it in the clip, to open out of it (see shapeOf).
function Page({ index, image, fit, left, width, height, morph, whole, motion, onOriginalLoad }: PageProps) {
  const { progress, page, zoomPage, scale, x, y, pullX, pullY, kickX, kickY, uncrop, vanish } = motion
  const cut = morph?.crop ?? null
  // Until the original has loaded, the avatar stays over it whatever the swap.
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!loaded) return
    onOriginalLoad(index, true)
    return () => onOriginalLoad(index, false)
  }, [loaded, index, onOriginalLoad])
  // How far toward the thumbnail the picture is: 1 on it, 0 open.
  const flight = useDerivedValue(() => (morph && page.value === index ? 1 - progress.value : 0))
  // How far the original is out of the avatar, which only the picture the zoom is on has. A
  // spring cut short may carry it a little past either end.
  const unfold = useDerivedValue(() => (whole && zoomPage.value === index ? clamp(uncrop.value, 0, 1) : 0))
  const shape = useDerivedValue(() => (cut || whole ? shapeOf(fit, whole, cut, unfold.value, flight.value) : null))
  const frame = useAnimatedStyle(() => {
    const own = zoomPage.value === index
    const s = own ? scale.value : 1
    const zx = own ? x.value : 0
    const zy = own ? y.value : 0
    const shown = page.value === index
    const dx = shown ? pullX.value + kickX.value : 0
    const dy = shown ? pullY.value + kickY.value : 0
    // Taken away, or not yet come in in place of one taken away. Every page goes with it, the
    // ones beside being off the screen: whichever of them stands in the place once the pictures
    // come back without the one taken away may still have its style of the place it had.
    const v = vanish.value
    const gone = 1 - VANISH_SHRINK * v
    if (morph && shown) {
      const k = flight.value
      return {
        opacity: 1 - v,
        transform: [
          { translateX: morph.x * k + dx + zx },
          { translateY: morph.y * k + dy + zy },
          { scale: (1 + (morph.scale - 1) * k) * s * gone },
        ],
      }
    }
    const p = progress.value
    return {
      opacity: p * (1 - v),
      transform: [{ translateX: dx + zx }, { translateY: dy + zy }, { scale: (0.94 + 0.06 * p) * s * gone }],
    }
  })
  // The thumbnail's corners come in as the picture lands, and the window changes its size
  // around the middle of the avatar's frame, which stays where it is.
  const clip = useAnimatedStyle(() => {
    const k = flight.value
    const corners = morph
      ? {
          borderTopLeftRadius: morph.radii[0] * k,
          borderTopRightRadius: morph.radii[1] * k,
          borderBottomRightRadius: morph.radii[2] * k,
          borderBottomLeftRadius: morph.radii[3] * k,
        }
      : {}
    const s = shape.value
    if (!s) return corners
    const { width: w, height: h } = s.window
    return {
      ...corners,
      width: w,
      height: h,
      transform: [{ translateX: (fit.width - w) / 2 }, { translateY: (fit.height - h) / 2 }],
    }
  })
  // Each picture is laid out at its own frame from the window's corner and moved to its
  // place from the window's middle.
  const avatar = useAnimatedStyle(() => {
    const s = shape.value
    if (!s) return {}
    return {
      opacity: loaded ? s.avatar.opacity : 1,
      transform: [
        { translateX: (s.window.width - fit.width) / 2 + s.avatar.x },
        { translateY: (s.window.height - fit.height) / 2 + s.avatar.y },
        { scale: s.avatar.scale },
      ],
    }
  })
  const original = useAnimatedStyle(() => {
    const s = shape.value
    if (!whole || !s?.original) return {}
    return {
      transform: [
        { translateX: (s.window.width - whole.fit.width) / 2 + s.original.x },
        { translateY: (s.window.height - whole.fit.height) / 2 + s.original.y },
        { scale: s.original.scale },
      ],
    }
  })
  const box = { width: fit.width, height: fit.height }
  return (
    <View style={[styles.page, { left, width, height }]}>
      <Animated.View style={[styles.frame, frame]}>
        <Animated.View
          style={[
            styles.clip,
            box,
            { left: (width - fit.width) / 2, top: (height - fit.height) / 2 },
            morph?.continuous && styles.continuous,
            clip,
          ]}
        >
          {whole ? (
            <Animated.View style={[styles.layer, { width: whole.fit.width, height: whole.fit.height }, original]}>
              <Picture uri={whole.uri} style={StyleSheet.absoluteFill} contentFit="contain" onLoad={() => setLoaded(true)} />
            </Animated.View>
          ) : null}
          <Animated.View style={[styles.layer, box, avatar]}>
            {/* The thumbnail's own decoded picture is there at once, and the whole one, read
                from its file, fades in over it once it has loaded, as Photos sharpens. */}
            {image.preview ? <Image source={image.preview} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
            <Picture uri={image.uri} style={StyleSheet.absoluteFill} contentFit="contain" transition={image.preview ? 150 : undefined} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { ...FILL, overflow: 'hidden' },
  backdrop: { ...FILL },
  strip: { position: 'absolute', top: 0, left: 0 },
  page: { position: 'absolute', top: 0 },
  // As large as the page, so the original's frame, taller or wider than the avatar's, never
  // reaches past it; it moves and scales about the page's middle.
  frame: { ...FILL },
  clip: { position: 'absolute', overflow: 'hidden' },
  // The avatar and the original under it, placed in the window by their transforms.
  layer: { position: 'absolute', left: 0, top: 0 },
  continuous: { borderCurve: 'continuous' },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
})
