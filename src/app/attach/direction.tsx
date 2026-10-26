import { useNavigation, useRouter } from 'expo-router'
import { useLayoutEffect, useState } from 'react'

import { AttachScreenFrame, DirectionEditor, fillScreen } from '@/components/chat/AttachMenu'
import { useTranslation } from '@/i18n'
import { attachSession } from '@/lib/chat/attachSession'
import * as Haptics from '@/lib/ui/haptics'

// The direction editor, pushed inside the attach sheet.
export default function AttachDirectionScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { t } = useTranslation()
  const [session] = useState(attachSession)

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('direction.title'),
      unstable_headerRightItems: () => [
        {
          type: 'button',
          label: t('common.done'),
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            router.back()
          },
        },
      ],
    })
  }, [navigation, router, t])

  if (!session) return null
  return (
    <AttachScreenFrame look={session.look}>
      <DirectionEditor session={session} onDone={() => router.back()} scrollStyle={fillScreen} />
    </AttachScreenFrame>
  )
}
