import { Stack } from 'expo-router'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'

import { fonts, useColors, useStyles, type Colors } from '@/theme'

import { EdgeFade } from './BarChrome'
import { useHeaderHeight } from './GlassHeader'
import { Star } from './motifs/Star'

// The transparent native header of a form-style screen: a red star and a title on the
// left, with the content fading out underneath. Rendered inside the screen it belongs to.
export function FormScreenHeader({ title }: { title: string }) {
  const headerHeight = useHeaderHeight()
  const titleMaxWidth = useWindowDimensions().width - 160
  const colors = useColors()
  const styles = useStyles(createStyles)
  return (
    <>
      <EdgeFade edge="top" style={[styles.fade, { height: headerHeight + 28 }]} />
      <Stack.Screen
        options={{
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          headerTitleAlign: 'left',
          headerTitle: () => (
            <View style={[styles.row, { maxWidth: titleMaxWidth }]}>
              <Star size={22} color={colors.danger} rotation={-14} style={styles.star} />
              <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
                {title}
              </Text>
            </View>
          ),
        }}
      />
    </>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    fade: { pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
    star: { marginTop: 2 },
    title: { color: colors.text, fontFamily: fonts.prose, fontWeight: '700', fontSize: 28, flexShrink: 1 },
  })
