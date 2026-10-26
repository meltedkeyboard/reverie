import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import { useCallback, useEffect, useLayoutEffect, useReducer, useState } from 'react'

import { AttachMenu, AttachScreenFrame, fillScreen } from '@/components/chat/AttachMenu'
import { useTranslation } from '@/i18n'
import { attachSession, setAttachAfter } from '@/lib/chat/attachSession'

// The main screen of the attach sheet (see the layout next to it).
export default function AttachScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { t } = useTranslation()
  // Read once: the next opening may replace it under a sheet still closing.
  const [session] = useState(attachSession)
  // Drawn again when the persona picker comes back, for the persona chosen there.
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useFocusEffect(useCallback(() => refresh(), []))

  useEffect(() => {
    if (!session) router.back()
  }, [session, router])

  const close = (then?: () => void) => {
    setAttachAfter(then ?? null)
    navigation.getParent()?.goBack()
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('attach.addToChat'),
      unstable_headerLeftItems: () => [
        {
          type: 'button',
          label: t('common.close'),
          icon: { type: 'sfSymbol', name: 'xmark' },
          onPress: () => close(),
        },
      ],
      unstable_headerRightItems: () =>
        session
          ? [
              {
                type: 'button',
                label: t('attach.photos'),
                onPress: () => close(() => session.onPick('library')),
              },
            ]
          : [],
    })
  }, [navigation, session, t])

  if (!session) return null
  return (
    <AttachScreenFrame look={session.look}>
      <AttachMenu
        session={session}
        onClose={close}
        onOpenPersonas={() => router.push('/attach/persona')}
        onOpenDirection={() => router.push('/attach/direction')}
        scrollStyle={fillScreen}
      />
    </AttachScreenFrame>
  )
}
