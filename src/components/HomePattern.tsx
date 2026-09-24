import { useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'

import { useTheme } from '@/theme'

const TILES = {
  light: require('../../assets/images/pattern-light.png'),
  dark: require('../../assets/images/pattern-dark.png'),
}

// Size of one tile in points; the pattern repeats every 131 across and 213 down.
const TILE = { width: 131, height: 213 }

// The star pattern behind the home screen, laid out tile by tile from the top left
// corner: resizeMode="repeat" does not fill the view on every platform.
export function HomePattern() {
  const { scheme } = useTheme()
  const [size, setSize] = useState({ width: 0, height: 0 })

  const columns = Math.ceil(size.width / TILE.width)
  const rows = Math.ceil(size.height / TILE.height)
  const tiles = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      tiles.push(
        <Image
          key={`${row}:${column}`}
          source={TILES[scheme]}
          style={[styles.tile, { left: column * TILE.width, top: row * TILE.height }]}
        />
      )
    }
  }

  return (
    <View
      pointerEvents="none"
      style={styles.pattern}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {tiles}
    </View>
  )
}

const styles = StyleSheet.create({
  pattern: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  tile: { position: 'absolute', width: TILE.width, height: TILE.height },
})
