import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { useNavigation, useRouter } from 'expo-router'
import { useCallback, useEffect, useLayoutEffect } from 'react'

import { ThoughtSheetContent } from '@/components/chat/ThoughtSheet'
import { useStore } from '@/components/chat/thread/store'
import { useTranslation } from '@/i18n'
import { markThoughtClosing, markThoughtMounted, setThoughtDismiss, thoughtSession } from '@/lib/chat/thoughtSession'

// The screen of the thought sheet on iOS (system sheet), with Close and Copy on the bar.
export default function ThoughtScreen() {
  const router = useRouter()
  const navigation = useNavigation()
  const { t } = useTranslation()
  const thought = useStore(thoughtSession)

  useEffect(() => {
    markThoughtMounted()
    return () => {
      markThoughtClosing()
    }
  }, [])

  useEffect(() => {
    if (!thought) router.back()
  }, [thought, router])

  useEffect(() => {
    setThoughtDismiss(() => router.back())
    return () => setThoughtDismiss(null)
  }, [router])

  useEffect(() => {
    return navigation.addListener('beforeRemove' as never, () => {
      markThoughtClosing()
    })
  }, [navigation])

  const copy = useCallback(async () => {
    if (!thought?.text) return
    await Clipboard.setStringAsync(thought.text)
    Haptics.selectionAsync()
  }, [thought?.text])

  useLayoutEffect(() => {
    const title = thought?.speakerName ?? t('message.reasoning')
    navigation.setOptions({
      title,
      unstable_headerLeftItems: () => [
        {
          type: 'button',
          label: t('common.close'),
          icon: { type: 'sfSymbol', name: 'xmark' },
          onPress: () => router.back(),
        },
      ],
      unstable_headerRightItems: () => [
        {
          type: 'button',
          label: t('action.copy'),
          icon: { type: 'sfSymbol', name: 'doc.on.doc' },
          onPress: copy,
        },
      ],
    })
  }, [navigation, t, thought?.speakerName, copy])

  if (!thought) return null

  return <ThoughtSheetContent {...thought} />
}
