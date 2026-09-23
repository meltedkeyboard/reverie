import { Image } from 'expo-image'
import type { ImageStyle, StyleProp } from 'react-native'

// wordmark.svg's viewBox; the spark sticks out past the letters up and to the left.
const VIEW = { x: -499, width: 7673, height: 1448 }
const LETTERS_MIDDLE = 7173.6 / 2

// How far right of the image's middle the letters' middle sits, as a share of its width.
const SHIFT = (LETTERS_MIDDLE - (VIEW.x + VIEW.width / 2)) / VIEW.width

type Props = {
  width: number
  // In a centered layout, moves the image so the letters are in the middle rather
  // than the letters together with the spark.
  optical?: boolean
  style?: StyleProp<ImageStyle>
}

// The full "Reverie" logo. One color works on both themes.
export function Wordmark({ width, optical = false, style }: Props) {
  const height = (width * VIEW.height) / VIEW.width
  return (
    <Image
      source={require('../../assets/brand/wordmark.svg')}
      accessibilityRole="image"
      accessibilityLabel="Reverie"
      style={[
        { width, height },
        optical && { transform: [{ translateX: -SHIFT * width }] },
        style,
      ]}
    />
  )
}
