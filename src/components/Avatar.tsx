import { Image } from 'expo-image'
import { Text, View } from 'react-native'

import { avatarUri } from '@/lib/avatars'
import { fonts } from '@/theme'

const TINTS = ['#3B2F5C', '#2F4A5C', '#5C3B47', '#365C48', '#5C4F2F', '#40406B']

type Props = {
  name: string
  file?: string | null
  uri?: string | null
  size: number
  // Square corners, for an avatar that fills the edge of a card clipping it.
  square?: boolean
}

export function Avatar({ name, file, uri, size, square = false }: Props) {
  const source = uri ?? (file ? avatarUri(file) : null)
  const box = { width: size, height: size, borderRadius: square ? 0 : size / 2, overflow: 'hidden' as const }

  if (source) {
    return <Image source={{ uri: source }} style={box} contentFit="cover" transition={150} />
  }

  const tint = TINTS[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % TINTS.length]
  return (
    <View style={[box, { backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: fonts.prose, fontSize: size * 0.42 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  )
}
