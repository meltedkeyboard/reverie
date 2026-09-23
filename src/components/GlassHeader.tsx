import { useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { liquidGlass } from '@/lib/nativeUI'
import { fonts, HEADER_ROW_HEIGHT, useStyles, type Colors } from '@/theme'

import { BlurBar, EdgeFade } from './BarChrome'
import { IconButton } from './IconButton'

type Props = {
  left?: React.ReactNode
  right?: React.ReactNode
  children?: React.ReactNode
  // With Liquid Glass the bar itself disappears: the controls float over the content
  // and a fade stands in for the scroll edge effect of iOS 26.
  floating?: boolean
}

const FADE_OVERHANG = 28

export function useHeaderHeight() {
  return useSafeAreaInsets().top + HEADER_ROW_HEIGHT
}

// Content padding for a screen that scrolls under the header: a list of cards, or a
// form, which gets a little more air at both ends.
export function useScreenPadding(kind: 'list' | 'form') {
  const insets = useSafeAreaInsets()
  const top = insets.top + HEADER_ROW_HEIGHT
  return kind === 'list'
    ? { paddingTop: top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: 16, flexGrow: 1 }
    : { paddingTop: top + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }
}

export function HeaderTitle({ children }: { children: React.ReactNode }) {
  const styles = useStyles(createStyles)
  return (
    <Text style={styles.title} numberOfLines={1}>
      {children}
    </Text>
  )
}

// Goes back; a screen presented modally closes with a cross instead.
export function BackButton({ close }: { close?: boolean }) {
  const router = useRouter()
  return <IconButton name={close ? 'close' : 'chevron-back'} size={close ? 24 : 26} onPress={() => router.back()} />
}

export function GlassHeader({ left, right, children, floating }: Props) {
  const insets = useSafeAreaInsets()
  const styles = useStyles(createStyles)
  const row = (
    <View style={styles.row} pointerEvents="box-none">
      {left}
      <View style={[styles.center, !left && { paddingLeft: 12 }]} pointerEvents="box-none">
        {children}
      </View>
      {right}
    </View>
  )

  if (floating && liquidGlass) {
    return (
      <View style={[styles.floating, { paddingTop: insets.top }]} pointerEvents="box-none">
        <EdgeFade edge="top" style={[styles.fade, { height: insets.top + HEADER_ROW_HEIGHT + FADE_OVERHANG }]} />
        {row}
      </View>
    )
  }

  return (
    <BlurBar edge="top" style={[styles.root, { paddingTop: insets.top }]}>
      {row}
    </BlurBar>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    title: { color: colors.text, fontFamily: fonts.prose, fontSize: 19, fontWeight: '600' },
    root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  floating: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0 },
  row: {
    height: HEADER_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 4 },
})
