import { useNavigation, useRouter } from 'expo-router'
import { useEffect, useLayoutEffect } from 'react'

import { CastSheetContent } from '@/components/cast/CastSheet'
import { AttachScreenFrame, fillScreen } from '@/components/chat/AttachMenu'
import { useStore } from '@/components/chat/thread/store'
import { useTranslation } from '@/i18n'
import { castSession, setCastDismiss } from '@/lib/chat/castSession'

// The screen of the cast sheet (see the layout next to it): the rows the scene publishes,
// with Close on the bar.
export default function CastScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { t } = useTranslation()
  const cast = useStore(castSession)

  useEffect(() => {
    if (!cast) router.back()
  }, [cast, router])

  // The scene takes the sheet away through this, when a choice in it leads elsewhere.
  useEffect(() => {
    setCastDismiss(() => navigation.getParent()?.goBack())
    return () => setCastDismiss(null)
  }, [navigation])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('room.castTitle'),
      unstable_headerLeftItems: () => [
        {
          type: 'button',
          label: t('common.close'),
          icon: { type: 'sfSymbol', name: 'xmark' },
          onPress: () => navigation.getParent()?.goBack(),
        },
      ],
    })
  }, [navigation, t])

  if (!cast) return null
  return (
    <AttachScreenFrame look={cast.look}>
      <CastSheetContent {...cast} scrollStyle={fillScreen} />
    </AttachScreenFrame>
  )
}
