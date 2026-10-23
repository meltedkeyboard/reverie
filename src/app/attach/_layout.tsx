import { Stack, ThemeProvider, useTheme as useNavigationTheme } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { AttachStackContext } from '@/components/chat/AttachMenu'
import { ChatBackdrop, useChatBackdrop, useChatBackdropTone } from '@/components/chrome/ChatChrome'
import { SheetBackdropContext, useSheetTones } from '@/components/overlays/BottomSheet'
import { attachSession, finishAttachSession, type AttachSession } from '@/lib/chat/attachSession'
import { SchemeOverride, useColors, useTheme } from '@/theme'

// The attach menu of the composer as the system sheet (iOS): a stack of its own, so the
// persona picker is pushed inside the sheet with the system's bar and back button. The
// sheet itself is set in the root layout. Over the chat's picture the menu takes the scheme
// the picture reads best in, blurred as the sheet shows it, and so does the system's bar.
export default function AttachLayout() {
  const [session] = useState(attachSession)
  const scheme = useChatBackdropTone(session?.look)
  return (
    <SchemeOverride scheme={scheme}>
      <SheetBackdropContext.Provider value={scheme !== null}>
        <AttachStack session={session} />
      </SheetBackdropContext.Provider>
    </SchemeOverride>
  )
}

function AttachStack({ session }: { session: AttachSession | null }) {
  const colors = useColors()
  const { scheme } = useTheme()
  const tones = useSheetTones({ noGlass: true })
  // The system's buttons and title on the bar take their light or dark look from the
  // navigation theme, not from ours, so it is given the menu's scheme as well.
  const outer = useNavigationTheme()
  const navigationTheme = useMemo(() => ({ ...outer, dark: scheme === 'dark' }), [outer, scheme])
  // Over the chat's background the bar is see-through and each screen draws the background
  // from under it (AttachScreenFrame); the one under the stack shows should a screen be
  // clipped to its own frame.
  const backdrop = useChatBackdrop(session?.look)
  const root = useRef<View>(null)

  // The root layout runs what follows the menu once the sheet has finished going away;
  // should that report never come, the menu still lets go a moment after it is gone.
  useEffect(() => () => void setTimeout(() => finishAttachSession(session), 600), [session])

  return (
    <AttachStackContext.Provider value={root}>
      <View ref={root} style={styles.root}>
        <ChatBackdrop owner={session?.look} />
        <ThemeProvider value={navigationTheme}>
          <Stack
            screenOptions={{
              headerShown: true,
              headerShadowVisible: false,
              headerBackButtonDisplayMode: 'minimal',
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
