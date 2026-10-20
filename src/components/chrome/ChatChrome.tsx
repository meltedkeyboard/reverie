import { StyleSheet, View } from 'react-native'

import { Icon } from '@/components/visuals/Icon'

import { ChatBackground } from '@/components/chat/ChatBackground'
import { GlassButton } from '@/components/chrome/Glass'
import { Pattern } from '@/components/visuals/Pattern'
import { SFIcon } from '@/components/visuals/SFIcon'
import type { Character } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { avatarUri } from '@/lib/images/avatars'
import { useChatTextSettings } from '@/lib/chat/chatText'
import { FILL, useColors, useTheme } from '@/theme'

// What a character or a room says about the look of its chats.
export type ChatLook = Pick<Character, 'background' | 'backgroundEffect' | 'backgroundIntensity' | 'backgroundBubbleTransparency'>

// What is behind the messages: the owner's own picture, else the custom wallpaper or pattern chosen in Settings.
// `anchor` is the pattern's, off in a sheet. `blurred` is ChatBackground's.
export function ChatSurface({ owner, anchor, blurred }: { owner: ChatLook; anchor?: boolean; blurred?: boolean }) {
  const { pattern, wallpaper } = useChatTextSettings()
  if (owner.background) {
    return (
      <ChatBackground
        uri={avatarUri(owner.background, 'backgrounds') ?? ''}
        effect={owner.backgroundEffect}
        intensity={owner.backgroundIntensity}
        blurred={blurred}
      />
    )
  }
  if (pattern === 'custom' && wallpaper?.file) {
    return (
      <ChatBackground
        uri={avatarUri(wallpaper.file, 'backgrounds') ?? ''}
        effect={wallpaper.effect}
        intensity={wallpaper.intensity}
        blurred={blurred}
      />
    )
  }
  return <Pattern id={pattern} anchor={anchor} />
}

// Whether the chat's background is carried onto what opens over the chat or slides out from
// under it: switched on in Settings, and something there to carry, a picture or a pattern.
export function useChatBackdrop(owner: ChatLook | null | undefined) {
  const { pattern, wallpaper, backdrop } = useChatTextSettings()
  if (!owner || !backdrop) return false
  if (owner.background) return true
  return pattern === 'custom' ? Boolean(wallpaper?.file) : pattern !== 'none'
}

// How light the carried background is, for what is laid over it see-through: the scheme of
// a picture's dim (dim-light, dim-dark, the theme's for the rest), else of the theme; null
// when nothing is carried.
export function useChatBackdropTone(owner: ChatLook | null | undefined): 'light' | 'dark' | null {
  const { scheme } = useTheme()
  const { pattern, wallpaper } = useChatTextSettings()
  const shown = useChatBackdrop(owner)
  if (!shown || !owner) return null
  const effect = owner.background ? owner.backgroundEffect : pattern === 'custom' ? wallpaper?.effect : undefined
  return effect === 'dim-light' ? 'light' : effect === 'dim-dark' ? 'dark' : scheme
}

// The chat's background under a sheet or the drawer's list, on the chat's own color, which
// covers the sheet's; nothing when `useChatBackdrop` says no. `blurred` as in ChatSurface.
export function ChatBackdrop({ owner, blurred }: { owner: ChatLook | null | undefined; blurred?: boolean }) {
  const colors = useColors()
  const shown = useChatBackdrop(owner)
  if (!shown || !owner) return null
  return (
    <View pointerEvents="none" style={[styles.backdrop, { backgroundColor: colors.bg }]}>
      <ChatSurface owner={owner} anchor={false} blurred={blurred} />
    </View>
  )
}

// Over a picture the user's bubbles can be made see-through.
export const bubbleOpacityOf = (
  owner: ChatLook,
  wallpaper?: { file: string | null; bubbleTransparency: number } | null,
  pattern?: string
) => {
  if (owner.background) return 1 - owner.backgroundBubbleTransparency
  if (pattern === 'custom' && wallpaper?.file) return 1 - wallpaper.bubbleTransparency
  return 1
}

// The eye in the header that opens the private thread with the model. It stays while the
// thread is open, even if the button is turned off in Settings.
export function AsideToggleButton({ open, enabled, onPress }: { open: boolean; enabled: boolean; onPress: () => void }) {
  const colors = useColors()
  const { t } = useTranslation()
  if (!enabled && !open) return null
  const fallback: React.ComponentProps<typeof Icon>['name'] = open ? 'eye-off' : 'eye-off-outline'
  return (
    <GlassButton icon={fallback} onPress={onPress} accessibilityLabel={t('chat.privateTitle')}>
      <SFIcon name={open ? 'eye.slash.fill' : 'eye.slash'} fallback={fallback} size={20} color={colors.text} animateChange={open} />
    </GlassButton>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...FILL, overflow: 'hidden' },
})
