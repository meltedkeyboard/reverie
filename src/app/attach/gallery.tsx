import { useNavigation } from 'expo-router'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

import { AttachGalleryPicker } from '@/components/chat/AttachGallery'
import { AttachScreenFrame, fillScreen } from '@/components/chat/AttachMenu'
import { useChatWallpaperAccent } from '@/components/chrome/ChatChrome'
import { useTranslation } from '@/i18n'
import { attachSession, setAttachAfter } from '@/lib/chat/attachSession'
import { useColors } from '@/theme'

// The character's gallery, or the cast's, pushed inside the attach sheet.
export default function AttachGalleryScreen() {
  const navigation = useNavigation()
  const { t } = useTranslation()
  const colors = useColors()
  const [session] = useState(attachSession)
  const wallpaperColors = useChatWallpaperAccent(session?.look)
  const confirmFn = useRef<() => void>(() => {})
  const [selectedCount, setSelectedCount] = useState(0)

  // Closes the whole sheet, not just this screen.
  const close = (then?: () => void) => {
    setAttachAfter(then ?? null)
    navigation.getParent()?.goBack()
  }

  const handleSelectionChange = useCallback((count: number, confirm: () => void) => {
    setSelectedCount(count)
    confirmFn.current = confirm
  }, [])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('gallery.title'),
      unstable_headerRightItems: () =>
        selectedCount > 0
          ? [
              {
                type: 'button',
                label: t('common.done'),
                icon: { type: 'sfSymbol', name: 'checkmark' },
                variant: 'prominent',
                tintColor: wallpaperColors?.accent ?? colors.accent,
                onPress: () => confirmFn.current(),
              },
            ]
          : [],
    })
  }, [navigation, t, selectedCount, wallpaperColors?.accent, colors.accent])

  if (!session) return null
  return (
    <AttachScreenFrame look={session.look}>
      <AttachGalleryPicker
        session={session}
        onClose={close}
        onSelectionChange={handleSelectionChange}
        scrollStyle={fillScreen}
      />
    </AttachScreenFrame>
  )
}
