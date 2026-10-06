import { useState } from 'react'
import { Image, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Defs, G, Path, Pattern as SvgPattern, Rect } from 'react-native-svg'

import type { ChatPatternId } from '@/db/prefs/settings'
import { isDesktop } from '@/lib/core/platform'
import { FILL, useTheme } from '@/theme'

const TILES = {
  light: require('../../../assets/images/pattern-light.png'),
  dark: require('../../../assets/images/pattern-dark.png'),
}
// One tile of the stars in points; the pattern repeats every 131 across and 213 down.
const TILE = { width: 131, height: 213 }

// The patterns come from the Penpot page "Background Pattern", drawn on a 393 x 852 board.
// Each keeps that board's coordinates and is placed by an anchor: a corner pattern stays in
// its corner and a centered one in the middle, in a window of any size.
const BOARD = { width: 393, height: 852 }

const TOP_STAR =
  'M209.739 122.372L115.762 123.253L96.841 263.873L88.192 138.756L69.061 199.654L64.036 147.809L18.298 239.802L39.171 141.064L-13.875 182.937L19.447 125.215L-85.293 150.597L15.759 101.855L-38.805 81.71L20.696 78.376L-88.881 47.823L34.79 51.297L47.957 -4.289L61.125 -59.876L78.603 25.507L141.562 -73.514L100.632 56.905L186.906 38.191L136.816 95.292Z'
const BOTTOM_STAR =
  'M296.452 904.198L314.401 834.607L214.278 792.8L308.406 811.174L267.211 784.99L306.501 791.54L247.603 739.548L316.404 774.508L295.974 727.038L332.015 763.076L333.997 680.686L349.9995 764.975L375.679 728.658L366.365 773.269L410.621 698.377L383.577 789.039L422.03 809.766L460.483 830.494L393.956 826.505L454.636 892.608L366.403 836.563L363.151 903.993L330.887 855.692Z'

// TOP_STAR is the board's first star, turned by 95 degrees and 340 across: a star of any
// size and turn is that, turned back, scaled and placed around its middle.
const STAR_MIDDLE = { x: 60.4, y: 95.2 }
const STAR_TURN = 95
const STAR_WIDTH = 340

// The phone's backgrounds are #F5F5F7 and #0F0F12; the desktop's, #FFFFFF and
// #1E1E1E. The stars keep the same small step from the background on both.
const COLORS = isDesktop ? { light: '#F1F1F1', dark: '#191919' } : { light: '#ECECEF', dark: '#0A0A0D' }
// The tiles of the stars are pictures made for the phone's background: on the desktop's
// they are faded until they sit as close to it as they do there.
const TILE_OPACITY = isDesktop ? { light: 0.6, dark: 0.3 } : { light: 1, dark: 1 }

type StarProps = { x: number; y: number; size: number; turn?: number; fill: string }

function Star({ x, y, size, turn = 0, fill }: StarProps) {
  const transform = `translate(${x} ${y}) rotate(${turn - STAR_TURN}) scale(${size / STAR_WIDTH}) translate(${-STAR_MIDDLE.x} ${-STAR_MIDDLE.y})`
  return (
    <G transform={transform}>
      <Path d={TOP_STAR} fill={fill} />
    </G>
  )
}

const DIAGONAL: [number, number, number, number][] = [
  [60, 90, 200, 10],
  [215, 430, 120, 60],
  [330, 700, 70, 120],
]
const SCATTERED: [number, number, number, number][] = [
  [50, 80, 70, 0],
  [310, 150, 50, 40],
  [150, 300, 36, 80],
  [320, 470, 90, 20],
  [70, 560, 54, 100],
  [190, 760, 80, 60],
  [360, 830, 40, 0],
]
const RING_RADII = [150, 260, 370, 480, 590]
const RING_WIDTH = 14

// The rings round a point of the board, with the star over their middle.
function Rings({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <>
      {RING_RADII.map((r) => (
        <Circle key={r} cx={x} cy={y} r={r} stroke={fill} strokeWidth={RING_WIDTH} fill="none" />
      ))}
      <Star x={x} y={y} size={240} turn={20} fill={fill} />
    </>
  )
}

type Placed = { dx: number; dy: number }

function Stars({ list, fill, width, at }: { list: typeof SCATTERED; fill: string; width: number; at: Placed }) {
  // Copies side by side, so a wide window is not left with one column of stars.
  const sides = Math.ceil(width / BOARD.width / 2)
  const copies = Array.from({ length: sides * 2 + 1 }, (_, i) => i - sides)
  return (
    <>
      {copies.map((k) => (
        <G key={k} transform={`translate(${at.dx + k * BOARD.width} ${at.dy})`}>
          {list.map(([x, y, size, turn]) => (
            <Star key={`${x}-${y}`} x={x} y={y} size={size} turn={turn} fill={fill} />
          ))}
        </G>
      ))}
    </>
  )
}

function Drawing({ id, fill, width, height }: { id: Exclude<ChatPatternId, 'none' | 'stars'>; fill: string; width: number; height: number }) {
  const center = { dx: (width - BOARD.width) / 2, dy: (height - BOARD.height) / 2 }
  const corner = { dx: width - BOARD.width, dy: height - BOARD.height }
  switch (id) {
    case 'two-stars':
      return (
        <>
          <Path d={TOP_STAR} fill={fill} />
          <G transform={`translate(${corner.dx} ${corner.dy})`}>
            <Path d={BOTTOM_STAR} fill={fill} />
          </G>
        </>
      )
    case 'big-star':
      return (
        <G transform={`translate(${center.dx} ${center.dy})`}>
          <Star x={BOARD.width / 2} y={BOARD.height * 0.62} size={620} turn={-20} fill={fill} />
        </G>
      )
    case 'diagonal':
      return <Stars list={DIAGONAL} fill={fill} width={width} at={center} />
    case 'scattered':
      return <Stars list={SCATTERED} fill={fill} width={width} at={center} />
    case 'rings':
      return (
        <G transform={`translate(${corner.dx} ${corner.dy})`}>
          <Rings x={BOARD.width} y={BOARD.height} fill={fill} />
        </G>
      )
    case 'rings-centered':
      return (
        <G transform={`translate(${center.dx} ${center.dy})`}>
          <Rings x={BOARD.width / 2} y={BOARD.height / 2} fill={fill} />
        </G>
      )
    case 'dots': {
      // Rows offset by half a step, as on the board.
      const name = `dots-${fill.slice(1)}`
      return (
        <>
          <Defs>
            <SvgPattern id={name} width={56} height={124} patternUnits="userSpaceOnUse">
              <Circle cx={28} cy={24} r={4} fill={fill} />
              <Circle cx={0} cy={86} r={4} fill={fill} />
              <Circle cx={56} cy={86} r={4} fill={fill} />
            </SvgPattern>
          </Defs>
          <Rect width={width} height={height} fill={`url(#${name})`} />
        </>
      )
    }
  }
}

type Props = {
  id: ChatPatternId
  // 1 is the board's own size; a smaller one shows the whole board in a small tile.
  scale?: number
  style?: StyleProp<ViewStyle>
}

// The star pattern of the home screen, laid out tile by tile from the top left corner:
// resizeMode="repeat" does not fill the view on every platform.
function Tiles({ scheme, width, height, scale }: { scheme: 'light' | 'dark'; width: number; height: number; scale: number }) {
  const tile = { width: TILE.width * scale, height: TILE.height * scale }
  const tiles = []
  for (let row = 0; row < Math.ceil(height / tile.height); row++) {
    for (let column = 0; column < Math.ceil(width / tile.width); column++) {
      tiles.push(
        <Image
          key={`${row}:${column}`}
          source={TILES[scheme]}
          style={{ position: 'absolute', width: tile.width, height: tile.height, left: column * tile.width, top: row * tile.height, opacity: TILE_OPACITY[scheme] }}
        />
      )
    }
  }
  return <>{tiles}</>
}

// Every pattern of the app, in the colors of the theme: the one of the home screen and the
// ones to choose behind chats. It fills its parent.
export function Pattern({ id, scale = 1, style }: Props) {
  const { scheme } = useTheme()
  const [size, setSize] = useState({ width: 0, height: 0 })
  if (id === 'none') return null
  const onLayout = (event: LayoutChangeEvent) => setSize(event.nativeEvent.layout)
  const width = size.width / scale
  const height = size.height / scale
  return (
    <View pointerEvents="none" style={[styles.pattern, style]} onLayout={onLayout}>
      {size.width && id === 'stars' ? <Tiles scheme={scheme} width={size.width} height={size.height} scale={scale} /> : null}
      {size.width && id !== 'stars' ? (
        <Svg width={size.width} height={size.height} viewBox={`0 0 ${width} ${height}`}>
          <Drawing id={id} fill={COLORS[scheme]} width={width} height={height} />
        </Svg>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  pattern: { ...FILL, overflow: 'hidden' },
})
