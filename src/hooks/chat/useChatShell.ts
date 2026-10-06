import { useRef, useState } from 'react'
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller'
import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { ConversationHandle } from '@/components/chat/ConversationList'
import { useHeaderHeight } from '@/components/chrome/GlassHeader'
import * as Haptics from '@/lib/ui/haptics'

// What the screen of a chat and the screen of a scene both keep around the message list:
// the list and the composer's measurements, the private thread with the model that the eye
// in the header opens, and the style that keeps an empty chat's intro centered.
//
// The thread is like /btw: the model reads the conversation and answers aside, and nothing
// of it is kept. While it is open the field talks to the model, so `clearEditing` drops a
// message being edited when it opens, and `aside.reset` clears the thread when it closes.
export function useChatShell(aside: { reset: () => void }, clearEditing: () => void) {
  const insets = useSafeAreaInsets()
  const headerHeight = useHeaderHeight()
  const keyboard = useReanimatedKeyboardAnimation()
  const listRef = useRef<ConversationHandle>(null)
  const composerHeight = useSharedValue(0)
  const composerTop = useSharedValue(0)
  const [asideOpen, setAsideOpen] = useState(false)
  // What was typed to the characters waits here while the field asks the model aside.
  const sceneDraft = useRef('')

  const toggleAside = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (asideOpen) aside.reset()
    else clearEditing()
    setAsideOpen(!asideOpen)
  }

  // The empty-chat intro stays centered in the space left between the header and the
  // composer, which moves up with the keyboard; the dock is lifted by the keyboard
  // height minus the home indicator inset it already pads for.
  const emptyStyle = useAnimatedStyle(() => ({
    paddingTop: headerHeight,
    paddingBottom: composerHeight.value + Math.max(0, Math.abs(keyboard.height.value) - insets.bottom),
  }))

  const scrollToNewest = () => listRef.current?.scrollToNewest()

  return { listRef, composerHeight, composerTop, asideOpen, toggleAside, sceneDraft, emptyStyle, scrollToNewest }
}
