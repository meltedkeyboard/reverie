import { withSpring, withTiming, type SharedValue } from 'react-native-reanimated'

// The physics the viewer moves by, after Apple's "Designing Fluid Interfaces": springs given by
// how quickly they arrive and how much they overshoot, a flick carried on to where it would come
// to rest, and the give of something pulled past its edge.

// A spring by its response (about the seconds it takes to get there) and its damping ratio (1
// never overshoots, lower bounces), as iOS gives them, in the mass, stiffness and damping
// Reanimated takes. `velocity` is the speed it sets off with, in points a second.
export function spring(response: number, dampingRatio = 1, velocity = 0) {
  'worklet'
  const stiffness = ((2 * Math.PI) / response) ** 2
  const damping = (4 * Math.PI * dampingRatio) / response
  return { mass: 1, stiffness, damping, velocity }
}

// A scroll view's normal slowing down: the speed falls to 0.998 of itself every millisecond.
const DECELERATION = 0.998
const DECAY_MS = -1 / Math.log(DECELERATION)

// How far a flick at `velocity` carries on before it comes to rest.
export function project(velocity: number) {
  'worklet'
  return ((velocity / 1000) * DECELERATION) / (1 - DECELERATION)
}

// How far something follows a finger dragging it `overshoot` past its edge: ever less the
// further it goes, and never more than `dimension`.
export function rubberband(overshoot: number, dimension: number) {
  'worklet'
  const c = 0.55
  const o = Math.abs(overshoot)
  return Math.sign(overshoot) * ((o * dimension * c) / (dimension + c * o))
}

// The other way round: how far past its edge a finger must have dragged something for it to
// be `given` past, so a drag that catches it springing back carries on from where it is.
export function unrubberband(given: number, dimension: number) {
  'worklet'
  const c = 0.55
  const g = Math.min(Math.abs(given), dimension * 0.99)
  return Math.sign(given) * ((g * dimension) / (c * (dimension - g)))
}

// `value` kept between `min` and `max`, giving past them like a rubber band.
export function resist(value: number, min: number, max: number, dimension: number) {
  'worklet'
  if (value < min) return min + rubberband(value - min, dimension)
  if (value > max) return max + rubberband(value - max, dimension)
  return value
}

// What resist() was given to show `value`.
export function unresist(value: number, min: number, max: number, dimension: number) {
  'worklet'
  if (value < min) return min + unrubberband(value - min, dimension)
  if (value > max) return max + unrubberband(value - max, dimension)
  return value
}

export function clamp(value: number, min: number, max: number) {
  'worklet'
  return Math.min(Math.max(value, min), max)
}

// Lets `value` coast on from the finger at `velocity` and slow down as a scroll view does.
// Where that would carry it past `min` or `max`, it springs to the edge instead with the same
// speed, so it runs a little past and comes back the way a scroll view bounces; pulled past
// the edge already, it springs back.
export function glide(value: SharedValue<number>, velocity: number, min: number, max: number) {
  'worklet'
  const from = value.value
  if (from < min || from > max) {
    value.value = withSpring(from < min ? min : max, spring(0.4, 1, velocity))
    return
  }
  const rest = from + project(velocity)
  if (rest < min || rest > max) {
    value.value = withSpring(rest < min ? min : max, spring(0.45, 1, velocity))
    return
  }
  const speed = Math.abs(velocity)
  if (speed < 20) return
  // The same falling speed as project(): it moves on until under 10 points a second, the
  // easing being the distance covered by then.
  const duration = Math.min(DECAY_MS * Math.log(speed / 10), 2000)
  const k = duration / DECAY_MS
  const total = 1 - Math.exp(-k)
  value.value = withTiming(from + (velocity / 1000) * DECAY_MS * total, {
    duration,
    easing: (t: number) => {
      'worklet'
      return (1 - Math.exp(-k * t)) / total
    },
  })
}
