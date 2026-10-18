import { useNavigation, useRouter } from 'expo-router'
import { useLayoutEffect, useState } from 'react'

import { PersonaPicker, fillScreen } from '@/components/chat/AttachMenu'
import { useTranslation } from '@/i18n'
import { attachSession, setAttachAfter } from '@/lib/chat/attachSession'
import * as Haptics from '@/lib/ui/haptics'

// The persona picker, pushed inside the attach sheet.
export default function AttachPersonaScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { t } = useTranslation()
  const [session] = useState(attachSession)

  // Closes the whole sheet, not just this screen.
  const close = (then?: () => void) => {
    setAttachAfter(then ?? null)
    navigation.getParent()?.goBack()
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('persona.pickerTitle'),
      unstable_headerRightItems: () => [
        {
          type: 'button',
          label: t('persona.create'),
          icon: { type: 'sfSymbol', name: 'plus' },
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            close(() => router.push('/persona/new'))
          },
        },
      ],
    })
  }, [navigation, router, t])

  if (!session) return null
  return <PersonaPicker session={session} onClose={close} onChosen={() => router.back()} scrollStyle={fillScreen} />
}
