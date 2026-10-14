import { useRouter } from 'expo-router'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { columnInset, columnInsets, FORM_COLUMN } from '@/hooks/util/useLayoutMode'
import { floatingBars } from '@/lib/ui/nativeUI'
import { fonts, HEADER_FONT_SCALE, HEADER_ROW_HEIGHT, useColors, useStyles, type Colors } from '@/theme'

import { BlurBar, EdgeFade } from './BarChrome'
import { GlassButton } from './Glass'
import { IconButton } from '../controls/IconButton'
import { Star } from '../visuals/motifs/Star'
import { isDesktop, isIOS } from '@/lib/core/platform'

type Props = {
  left?: React.ReactNode
  right?: React.ReactNode
  children?: React.ReactNode
  // With Liquid Glass the bar itself disappears: the controls float over the content
  // and a fade stands in for the scroll edge effect of iOS 26.
  floating?: boolean
  centerTitle?: boolean
}

const FADE_OVERHANG = 28

export function useHeaderHeight() {
  return useSafeAreaInsets().top + HEADER_ROW_HEIGHT
}

// Content padding for a screen that scrolls under the header: a list of cards, or a
// form, which gets a little more air at both ends.
export function useScreenPadding(kind: 'list' | 'form') {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const top = insets.top + HEADER_ROW_HEIGHT
  // A wide window or landscape orientation gets a centered column while keeping safe area margins.
  const side = columnInsets(width, FORM_COLUMN, Math.max(16, insets.left), Math.max(16, insets.right))
  return kind === 'list'
    ? { paddingTop: top + 16, paddingBottom: insets.bottom + 24, ...side, flexGrow: 1 }
    : { paddingTop: top + 20, paddingBottom: insets.bottom + 40, ...side }
}

export function HeaderTitle({ children }: { children: React.ReactNode }) {
  const styles = useStyles(createStyles)
  return (
    <Text maxFontSizeMultiplier={HEADER_FONT_SCALE} style={styles.title} numberOfLines={1}>
      {children}
    </Text>
  )
}

// The large title of a tab: a red star and the name in the prose face.
// With `fit` a long name shrinks to the room it has instead of being cut off.
export function TabTitle({ children, maxWidth, fit }: { children: React.ReactNode; maxWidth?: number; fit?: boolean }) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <View style={[styles.tabTitleRow, maxWidth !== undefined && { maxWidth }]}>
      <Star size={isDesktop ? 18 : 22} color={colors.danger} rotation={-14} style={styles.tabTitleStar} />
      <Text
        maxFontSizeMultiplier={HEADER_FONT_SCALE}
        style={styles.tabTitle}
        numberOfLines={1}
        adjustsFontSizeToFit={fit}
        minimumFontScale={fit ? 0.5 : undefined}
      >
        {children}
      </Text>
    </View>
  )
}

// Goes back; a screen presented modally closes with a cross instead.
export function BackButton({ close }: { close?: boolean }) {
  const router = useRouter()
  const name = close ? 'close' : 'chevron-back'
  const size = close ? 24 : 26
  // iOS keeps the plain icon; elsewhere it sits on the round surface like the other bar buttons.
  if (isIOS) return <IconButton name={name} size={size} onPress={() => router.back()} />
  return <GlassButton icon={name} iconSize={size} onPress={() => router.back()} />
}

export function GlassHeader({ left, right, children, floating, centerTitle }: Props) {
  const insets = useSafeAreaInsets()
  const styles = useStyles(createStyles)
  const row = (
    <View
      style={[
        styles.row,
        {
          paddingLeft: Math.max(8, insets.left + 4),
          paddingRight: Math.max(8, insets.right + 4),
        },
      ]}
      pointerEvents="box-none"
    >
      {centerTitle ? (
        <View
          style={[
            styles.centered,
            {
              left: insets.left,
              right: insets.right,
              paddingHorizontal: Math.max(60, Math.max(insets.left, insets.right) + 40),
            },
          ]}
          pointerEvents="box-none"
        >
          {children}
        </View>
      ) : null}
      {left}
      {!centerTitle ? (
        <View style={[styles.center, !left && { paddingLeft: 12 }]} pointerEvents="box-none">
          {children}
        </View>
      ) : (
        <View style={styles.center} pointerEvents="none" />
      )}
      {right}
    </View>
  )

  if (floating && floatingBars) {
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
    tabTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
    tabTitleStar: { marginTop: 2 },
    tabTitle: { color: colors.text, fontFamily: fonts.prose, fontWeight: '700', fontSize: 28, flexShrink: 1 },
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
  centered: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 60,
  },
  // The prose face stays, it is the app's own; on the desktop the titles are just smaller,
  // in proportion to the compact chrome.
  ...(isDesktop
    ? {
        title: { color: colors.text, fontFamily: fonts.prose, fontSize: 16, fontWeight: '600' as const },
        tabTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, flexShrink: 1 },
        tabTitle: { color: colors.text, fontFamily: fonts.prose, fontWeight: '700' as const, fontSize: 22, flexShrink: 1 },
      }
    : {}),
})
