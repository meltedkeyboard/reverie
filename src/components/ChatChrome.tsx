import { Icon } from '@/components/Icon'

import { ChatBackground } from '@/components/ChatBackground'
import { GlassButton } from '@/components/Glass'
import { Pattern } from '@/components/Pattern'
import { SFIcon } from '@/components/SFIcon'
import type { Character } from '@/db/characters'
import { useTranslation } from '@/i18n'
import { avatarUri } from '@/lib/avatars'
import { useChatTextSettings } from '@/lib/chatText'
import { useColors } from '@/theme'

// What a character or a room says about the look of its chats.
type Look = Pick<Character, 'background' | 'backgroundEffect' | 'backgroundIntensity' | 'backgroundBubbleTransparency'>

// What is behind the messages: the owner's own picture, else the pattern chosen in Settings.
export function ChatSurface({ owner }: { owner: Look }) {
  const { pattern } = useChatTextSettings()
  if (!owner.background) return <Pattern id={pattern} />
  return (
    <ChatBackground
      uri={avatarUri(owner.background, 'backgrounds') ?? ''}
      effect={owner.backgroundEffect}
      intensity={owner.backgroundIntensity}
    />
  )
}

// Over a picture the user's bubbles can be made see-through.
export const bubbleOpacityOf = (owner: Look) => (owner.background ? 1 - owner.backgroundBubbleTransparency : 1)

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
