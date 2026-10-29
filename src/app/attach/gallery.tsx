import { useNavigation } from 'expo-router'
import { useLayoutEffect, useState } from 'react'

import { AttachGalleryPicker } from '@/components/chat/AttachGallery'
import { AttachScreenFrame, fillScreen } from '@/components/chat/AttachMenu'
import { useTranslation } from '@/i18n'
import { attachSession, setAttachAfter } from '@/lib/chat/attachSession'

// The character's gallery, or the cast's, pushed inside the attach sheet.
export default function AttachGalleryScreen() {
  const navigation = useNavigation()
  const { t } = useTranslation()
  const [session] = useState(attachSession)

  // Closes the whole sheet, not just this screen.
  const close = (then?: () => void) => {
    setAttachAfter(then ?? null)
    navigation.getParent()?.goBack()
  }

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('gallery.title') })
  }, [navigation, t])

  if (!session) return null
  return (
    <AttachScreenFrame look={session.look}>
      <AttachGalleryPicker session={session} onClose={close} scrollStyle={fillScreen} />
    </AttachScreenFrame>
  )
}
