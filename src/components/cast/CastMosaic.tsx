import { StyleSheet, Text, View } from 'react-native'

import { avatarUri } from '@/lib/images/avatars'
import { originOf, type Corners } from '@/lib/images/viewer'
import { FILL, ON_ACCENT } from '@/theme'

import { Avatar } from '../visuals/Avatar'
import { ImageLink } from '../visuals/ImageLink'
import { castGallery } from './AvatarStack'

type Face = { name: string; avatar: string | null }

type Props = {
  cast: Face[]
  // The room's name, whose initial stands in for a cast with nobody in it.
  name: string
  size: number
  // Round, as a character's avatar in the same place; otherwise square with `corners`.
  round?: boolean
  // The corners a card cuts a square mosaic to, which each face's own corner follows.
  corners?: Exclude<Corners, number>
  // Fills the box it is put in instead of a size × size square.
  fill?: boolean
  // A tap opens the whole cast in the viewer, each photo growing out of its own tile.
  viewable?: boolean
}

// Four tiles at most: one face fills it, two split it down the middle, three put one beside
// two, and four are quarters; past that the last quarter counts the rest.
const MOST = 4

type Cell = { left: number; top: number; width: number; height: number }

// Where each shown face sits, in fractions of the whole.
function cellsFor(count: number): Cell[] {
  if (count <= 1) return [{ left: 0, top: 0, width: 1, height: 1 }]
  if (count === 2) return [{ left: 0, top: 0, width: 0.5, height: 1 }, { left: 0.5, top: 0, width: 0.5, height: 1 }]
  if (count === 3) {
    return [
      { left: 0, top: 0, width: 0.5, height: 1 },
      { left: 0.5, top: 0, width: 0.5, height: 0.5 },
      { left: 0.5, top: 0.5, width: 0.5, height: 0.5 },
    ]
  }
  return [
    { left: 0, top: 0, width: 0.5, height: 0.5 },
    { left: 0.5, top: 0, width: 0.5, height: 0.5 },
    { left: 0, top: 0.5, width: 0.5, height: 0.5 },
    { left: 0.5, top: 0.5, width: 0.5, height: 0.5 },
  ]
}

// A room's cast as one picture in the place where a character has its avatar: the header's
// photo button, the pill of the drawer, the edge of a card, the continue button. The faces
// are tiles of one shape with a thin gap between them, so the whole reads as one.
export function CastMosaic({ cast, name, size, round = false, corners, fill = false, viewable = false }: Props) {
  const shown = cast.length > MOST ? cast.slice(0, MOST) : cast
  const rest = cast.length - shown.length
  const cells = cellsFor(shown.length)
  const gap = Math.max(1, size / 48)
  const radius = round ? size / 2 : 0
  const shape = round
    ? { borderRadius: radius }
    : {
        borderTopLeftRadius: corners?.topLeft ?? 0,
        borderTopRightRadius: corners?.topRight ?? 0,
        borderBottomRightRadius: corners?.bottomRight ?? 0,
        borderBottomLeftRadius: corners?.bottomLeft ?? 0,
        borderCurve: corners?.continuous ? ('continuous' as const) : undefined,
      }
  const box = fill ? { flex: 1 } : { width: size, height: size }
  // A gap between tiles, laid as a margin on the inner edges only.
  const inset = (cell: Cell) => ({
    left: `${cell.left * 100}%` as const,
    top: `${cell.top * 100}%` as const,
    width: `${cell.width * 100}%` as const,
    height: `${cell.height * 100}%` as const,
    paddingLeft: cell.left > 0 ? gap / 2 : 0,
    paddingRight: cell.left + cell.width < 1 ? gap / 2 : 0,
    paddingTop: cell.top > 0 ? gap / 2 : 0,
    paddingBottom: cell.top + cell.height < 1 ? gap / 2 : 0,
  })
  const faceSize = shown.length > 1 ? size / 2 : size
  const mosaic = (
    <View style={[box, shape, styles.clip]}>
      {shown.length ? (
        shown.map((face, index) => (
          <View key={index} style={[styles.cell, inset(cells[index])]}>
            <View style={styles.face}>
              <Avatar name={face.name} file={face.avatar} size={faceSize} square fill viewable={false} />
              {rest > 0 && index === shown.length - 1 ? (
                <View style={styles.more}>
                  <Text style={[styles.moreText, { fontSize: Math.max(11, size * 0.18) }]}>+{rest}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ))
      ) : (
        <Avatar name={name} size={size} square fill viewable={false} />
      )}
    </View>
  )

  // The whole cast is swiped through, those counted on the last tile included.
  const gallery = viewable ? castGallery(cast) : []
  if (!gallery.length) return mosaic
  // Each tile is its own place to grow out of and land back in, keeping the corner of the
  // whole that falls on it. The faces only counted have none.
  const spots = (whole: { x: number; y: number; width: number; height: number }) =>
    cast.flatMap((face, index) => {
      if (!face.avatar || !avatarUri(face.avatar)) return []
      if (index >= shown.length) return [null]
      const cell = cells[index]
      const atLeft = cell.left === 0
      const atTop = cell.top === 0
      const atRight = cell.left + cell.width >= 1
      const atBottom = cell.top + cell.height >= 1
      const pad = inset(cell)
      const x = whole.x + cell.left * whole.width + pad.paddingLeft
      const y = whole.y + cell.top * whole.height + pad.paddingTop
      const width = cell.width * whole.width - pad.paddingLeft - pad.paddingRight
      const height = cell.height * whole.height - pad.paddingTop - pad.paddingBottom
      const corner = (on: boolean, r: number | undefined) => (on ? (r ?? 0) : 0)
      return [
        originOf(
          { x, y, width, height },
          round
            ? {
                topLeft: atLeft && atTop ? radius : 0,
                topRight: atRight && atTop ? radius : 0,
                bottomRight: atRight && atBottom ? radius : 0,
                bottomLeft: atLeft && atBottom ? radius : 0,
              }
            : {
                topLeft: corner(atLeft && atTop, corners?.topLeft),
                topRight: corner(atRight && atTop, corners?.topRight),
                bottomRight: corner(atRight && atBottom, corners?.bottomRight),
                bottomLeft: corner(atLeft && atBottom, corners?.bottomLeft),
                continuous: corners?.continuous,
              }
        ),
      ]
    })
  return (
    <ImageLink gallery={gallery} spots={spots} accessibilityLabel={cast.map((m) => m.name).join(', ')} style={fill ? styles.fill : undefined}>
      {mosaic}
    </ImageLink>
  )
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  fill: { flex: 1 },
  cell: { position: 'absolute' },
  face: { flex: 1, overflow: 'hidden' },
  more: { ...FILL, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  moreText: { color: ON_ACCENT, fontWeight: '600' },
})
