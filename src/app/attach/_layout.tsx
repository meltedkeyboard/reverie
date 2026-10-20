import { Stack } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { AttachStackContext } from '@/components/chat/AttachMenu'
import { ChatBackdrop, useChatBackdrop } from '@/components/chrome/ChatChrome'
import { useSheetTones } from '@/components/overlays/BottomSheet'
import { attachSession, finishAttachSession } from '@/lib/chat/attachSession'
import { useColors } from '@/theme'

// The attach menu of the composer as the system sheet (iOS): a stack of its own, so the
// persona picker is pushed inside the sheet with the system's bar and back button. The
// sheet itself is set in the root layout.
export default function AttachLayout() {
  const colors = useColors()
  const tones = useSheetTones({ noGlass: true })
  const [session] = useState(attachSession)
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
      </View>
    </AttachStackContext.Provider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
