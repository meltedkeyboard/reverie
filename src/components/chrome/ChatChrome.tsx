import { StyleSheet, View } from 'react-native'

import { ChatBackground } from '@/components/chat/ChatBackground'
import { Pattern } from '@/components/visuals/Pattern'
import type { BackgroundEffect, BackgroundTone, Character } from '@/db/characters'
import type { ChatWallpaper } from '@/db/prefs/settings'
import { avatarUri, cropFromJson } from '@/lib/images/avatars'
import { schemeOver } from '@/lib/images/backgroundTone'
import { usePictureColor } from '@/lib/images/pictureColor'
import { useChatTextSettings } from '@/lib/chat/chatText'
import { FILL, useColors, useTheme, type Scheme } from '@/theme'

// What a character or a room says about the look of its chats.
export type ChatLook = Pick<
  Character,
  'background' | 'backgroundCrop' | 'backgroundEffect' | 'backgroundIntensity' | 'backgroundBubbleTransparency' | 'backgroundTone'
>

type ChatPicture = { uri: string; crop: string | null; effect: BackgroundEffect; intensity: number; tone: BackgroundTone }

// The picture behind a chat: the owner's own, else the custom wallpaper chosen in Settings;
// null where a pattern is drawn.
export function pictureOf(owner: ChatLook, wallpaper: ChatWallpaper | null | undefined, pattern: string): ChatPicture | null {
  if (owner.background) {
    return {
      uri: avatarUri(owner.background, 'backgrounds') ?? '',
      crop: owner.backgroundCrop,
      effect: owner.backgroundEffect,
      intensity: owner.backgroundIntensity,
      tone: owner.backgroundTone,
    }
  }
  if (pattern === 'custom' && wallpaper?.file) {
    return {
      uri: avatarUri(wallpaper.file, 'backgrounds') ?? '',
      crop: wallpaper.crop,
      effect: wallpaper.effect,
      intensity: wallpaper.intensity,
      tone: wallpaper.tone,
    }
  }
  return null
}

// What is behind the messages: the owner's own picture, else the custom wallpaper or pattern chosen in Settings.
// `anchor` is the pattern's, off in a sheet. `blurred` is ChatBackground's.
export function ChatSurface({ owner, anchor, blurred }: { owner: ChatLook; anchor?: boolean; blurred?: boolean }) {
  const { pattern, wallpaper } = useChatTextSettings()
  const picture = pictureOf(owner, wallpaper, pattern)
  if (picture) {
    return (
      <ChatBackground
        uri={picture.uri}
        crop={cropFromJson(picture.crop)}
        effect={picture.effect}
        intensity={picture.intensity}
        blurred={blurred}
      />
    )
  }
  return <Pattern id={pattern} anchor={anchor} />
}

// The scheme a chat is shown in over its picture (`schemeOver`), for a SchemeOverride around
// it; null over a pattern, which is drawn in the theme's own colors. `blurred` is for the
// picture as the drawer's list and the menus show it. Read where the app's own scheme is.
export function useChatScheme(owner: ChatLook | null | undefined, blurred = false): Scheme | null {
  const { theme, scheme } = useTheme()
  const { pattern, wallpaper } = useChatTextSettings()
  const picture = owner ? pictureOf(owner, wallpaper, pattern) : null
  const color = usePictureColor(picture?.uri ?? null)
  if (!picture) return null
  return schemeOver({ ...picture, color: color ?? null, blurred }, theme, scheme)
}

// Whether the chat's background is carried onto what opens over the chat or slides out from
// under it: switched on in Settings, and something there to carry, a picture or a pattern.
export function useChatBackdrop(owner: ChatLook | null | undefined) {
  const { pattern, wallpaper, backdrop } = useChatTextSettings()
  if (!owner || !backdrop) return false
  if (owner.background) return true
  return pattern === 'custom' ? Boolean(wallpaper?.file) : pattern !== 'none'
}

// How light the carried background is, for what is laid over it: the scheme a blurred
// picture reads best in (`useChatScheme`), the theme's over a pattern; null when nothing is
// carried. What shows over it takes that scheme, through a SchemeOverride.
export function useChatBackdropTone(owner: ChatLook | null | undefined): Scheme | null {
  const { scheme } = useTheme()
  const shown = useChatBackdrop(owner)
  const picture = useChatScheme(owner, true)
  return shown ? (picture ?? scheme) : null
}

// The chat's background under a sheet or the drawer's list, on the chat's own color, which
// covers the sheet's; nothing when `useChatBackdrop` says no. A picture is always fully
// blurred and dimmed the same (`blurred` of ChatSurface), whatever the chat's own effect:
// what is laid over it reads at any strength chosen for the chat.
export function ChatBackdrop({ owner }: { owner: ChatLook | null | undefined }) {
  const colors = useColors()
  const shown = useChatBackdrop(owner)
  if (!shown || !owner) return null
  return (
    <View pointerEvents="none" style={[styles.backdrop, { backgroundColor: colors.bg }]}>
      <ChatSurface owner={owner} anchor={false} blurred />
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

const styles = StyleSheet.create({
  backdrop: { ...FILL, overflow: 'hidden' },
})
