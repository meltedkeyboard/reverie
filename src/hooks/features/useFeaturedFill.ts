import { useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'

import { useLayoutMode } from '@/hooks/util/useLayoutMode'
import { featuredFill, isFeatured } from '@/lib/ui/featuredLayout'

type Padding = { paddingTop: number; paddingBottom: number; paddingHorizontal: number }

// For a home tab: the height a lone item's card takes to fill the screen under the header
// (undefined while there are several, or none), and whether the list must still scroll.
// Put `onLayout` on the screen's root view.
export function useFeaturedFill(count: number, padding: Padding, reserved: number) {
  const [box, setBox] = useState({ width: 0, height: 0 })
  const wide = useLayoutMode() === 'wide'
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setBox((old) => (old.width === width && old.height === height ? old : { width, height }))
  }
  // A wide window keeps the ordinary list: one card as big as the window would be absurd.
  if (wide || !isFeatured(count) || !box.height) return { onLayout, height: undefined, scroll: count > 0 }
  const fill = featuredFill(box, padding.paddingTop + padding.paddingBottom + reserved, padding.paddingHorizontal)
  return { onLayout, height: fill.height, scroll: fill.scroll }
}
