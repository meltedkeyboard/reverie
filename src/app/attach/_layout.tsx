import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'

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

  // The root layout runs what follows the menu once the sheet has finished going away;
  // should that report never come, the menu still lets go a moment after it is gone.
  useEffect(() => () => void setTimeout(() => finishAttachSession(session), 600), [session])

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: tones.sheet },
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: tones.sheet },
      }}
    />
  )
}
