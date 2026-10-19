import { Icon } from '@/components/visuals/Icon'

import { ChatBackground } from '@/components/chat/ChatBackground'
import { GlassButton } from '@/components/chrome/Glass'
import { Pattern } from '@/components/visuals/Pattern'
import { SFIcon } from '@/components/visuals/SFIcon'
import type { Character } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { avatarUri } from '@/lib/images/avatars'
import { useChatTextSettings } from '@/lib/chat/chatText'
import { useColors } from '@/theme'

// What a character or a room says about the look of its chats.
type Look = Pick<Character, 'background' | 'backgroundEffect' | 'backgroundIntensity' | 'backgroundBubbleTransparency'>

// What is behind the messages: the owner's own picture, else the custom wallpaper or pattern chosen in Settings.
export function ChatSurface({ owner }: { owner: Look }) {
  const { pattern, wallpaper } = useChatTextSettings()
  if (owner.background) {
    return (
      <ChatBackground
        uri={avatarUri(owner.background, 'backgrounds') ?? ''}
        effect={owner.backgroundEffect}
        intensity={owner.backgroundIntensity}
      />
    )
  }
  if (pattern === 'custom' && wallpaper?.file) {
    return (
      <ChatBackground
        uri={avatarUri(wallpaper.file, 'backgrounds') ?? ''}
        effect={wallpaper.effect}
        intensity={wallpaper.intensity}
      />
    )
  }
  return <Pattern id={pattern} />
}

// Over a picture the user's bubbles can be made see-through.
export const bubbleOpacityOf = (
  owner: Look,
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
