import { useState } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'

// An asymmetric parallelogram, used everywhere a rounded rectangle would normally go
// (chips, buttons, tiles). The slant is proportional to height, not width, so a short
// wide bar doesn't end up looking like it's sliding off — see the Penpot exploration
// this was ported from.
type Props = {
  children?: React.ReactNode
  filled?: boolean
  color: string
  strokeWidth?: number
  rotation?: number
  style?: StyleProp<ViewStyle>
  contentStyle?: StyleProp<ViewStyle>
}

export function Shard({ children, filled = false, color, strokeWidth = 2, rotation = -1, style, contentStyle }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const slant = Math.min(28, Math.max(6, size.height * 0.3))
  return (
    <View
      style={[{ transform: [{ rotate: `${rotation}deg` }] }, style]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {size.width > 0 ? (
        <Svg width={size.width} height={size.height} style={{ position: 'absolute' }}>
          <Path
            d={`M${slant} 0 L${size.width} 0 L${size.width - slant} ${size.height} L0 ${size.height} Z`}
            fill={filled ? color : 'none'}
            stroke={filled ? 'none' : color}
            strokeWidth={strokeWidth}
          />
        </Svg>
      ) : null}
      <View style={contentStyle}>{children}</View>
    </View>
  )
}
