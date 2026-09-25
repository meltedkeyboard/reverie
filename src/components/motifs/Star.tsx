import Svg, { Path } from 'react-native-svg'
import type { StyleProp, ViewStyle } from 'react-native'

// The jagged "burst" star from the Reverie wordmark, used through the UI as a bullet,
// a toggle glyph, and a decorative mark. This is the exact path from the logo artwork.
const STAR_PATH =
  'M211.90 -389.75L245.97 -38.32L778.45 -13.55L313.02 59.79L547.20 111.45L354.81 147.23L714.08 288.29L337.71 242.50L511.79 427.32L284.85 321.51L414.14 705.20L198.63 342.96L141.10 553.77L109.14 332.17L30.67 752.28L3.18 288.29L-209.17 257.21L-421.52 226.13L-107.69 132.76L-498.90 -70.45L2.61 40.03L-95.68 -276.73L134.43 -107.96L211.90 -389.75Z'
const VIEW_BOX = '-499 -390 1278 1143'
const ASPECT = 1143 / 1278

type Props = {
  size?: number
  color: string
  filled?: boolean
  strokeWidth?: number
  rotation?: number
  style?: StyleProp<ViewStyle>
}

export function Star({ size = 16, color, filled = true, strokeWidth = 90, rotation = 0, style }: Props) {
  return (
    <Svg
      width={size}
      height={size * ASPECT}
      viewBox={VIEW_BOX}
      style={[rotation ? { transform: [{ rotate: `${rotation}deg` }] } : undefined, style]}
    >
      <Path
        d={STAR_PATH}
        fill={filled ? color : 'none'}
        stroke={filled ? 'none' : color}
        strokeWidth={strokeWidth}
      />
    </Svg>
  )
}
