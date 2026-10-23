import { Stack } from 'expo-router'

import { useSheetTones } from '@/components/overlays/BottomSheet'
import { useColors } from '@/theme'

// The controls of /avatar-crop as the system sheet (iOS), with the system's bar, as
// /background-look: a stack of one screen. The sheet itself is set in the root layout.
export default function AvatarCropLookLayout() {
  const colors = useColors()
  const tones = useSheetTones({ noGlass: true })
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: tones.sheet },
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: tones.sheet },
      }}
    />
  )
}
