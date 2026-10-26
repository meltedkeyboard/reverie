import { Stack, ThemeProvider, useTheme as useNavigationTheme } from 'expo-router'
import { useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View, type ViewInstance } from 'react-native'

import { AttachStackContext } from '@/components/chat/AttachMenu'
import { useStore } from '@/components/chat/thread/store'
import { ChatBackdrop, useChatBackdrop, useChatBackdropTone } from '@/components/chrome/ChatChrome'
import { SheetBackdropContext, useSheetTones } from '@/components/overlays/BottomSheet'
import { castSession, finishCastSession } from '@/lib/chat/castSession'
import { SchemeOverride, useColors, useTheme } from '@/theme'

// The cast sheet of a scene as the system sheet (iOS), with the system's bar as the attach
// menu has: a stack of one screen. The sheet itself is set in the root layout. Over the
// room's picture it takes the scheme the picture reads best in, blurred as the sheet shows
// it, and so does the system's bar.
export default function CastLayout() {
  const cast = useStore(castSession)
  const scheme = useChatBackdropTone(cast?.look)
  return (
    <SchemeOverride scheme={scheme}>
      <SheetBackdropContext.Provider value={scheme !== null}>
        <CastStack />
      </SheetBackdropContext.Provider>
    </SchemeOverride>
  )
}

function CastStack() {
  const colors = useColors()
  const { scheme } = useTheme()
  const tones = useSheetTones({ noGlass: true })
  const cast = useStore(castSession)
  const outer = useNavigationTheme()
  const navigationTheme = useMemo(() => ({ ...outer, dark: scheme === 'dark' }), [outer, scheme])
  // Over the room's background the bar is see-through and the screen draws the background
  // from under it (AttachScreenFrame).
  const backdrop = useChatBackdrop(cast?.look)
  const root = useRef<ViewInstance>(null)

  // The root layout tells the scene once the sheet has finished going away; should that
  // report never come, the scene still hears it a moment after the sheet is gone.
  useEffect(() => () => void setTimeout(finishCastSession, 600), [])

  return (
    <AttachStackContext.Provider value={root}>
      <View ref={root} style={styles.root}>
        <ChatBackdrop owner={cast?.look} />
        <ThemeProvider value={navigationTheme}>
          <Stack
            screenOptions={{
              headerShown: true,
              headerShadowVisible: false,
              headerStyle: { backgroundColor: backdrop ? 'transparent' : tones.sheet },
              headerTintColor: colors.accent,
              headerTitleStyle: { color: colors.text },
              contentStyle: { backgroundColor: backdrop ? 'transparent' : tones.sheet },
            }}
          />
        </ThemeProvider>
      </View>
    </AttachStackContext.Provider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
