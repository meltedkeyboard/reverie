import type { ComponentProps } from 'react'

import { useTranslation } from '@/i18n'
import type { ImageSource } from '@/lib/images'
import { swiftUI } from '@/lib/nativeUI'

import { NativeMenu, TapTrigger } from './NativeMenu'
import { isWeb } from '@/lib/platform'

type Props = Omit<ComponentProps<typeof NativeMenu>, 'items'> & {
  onPick: (source: ImageSource) => void
  // For a menu that opens above its button: iOS lists such a menu bottom to top, so the
  // items are turned round to still read camera, photo, file from the top.
  opensUp?: boolean
}

// Where a picture comes from: the camera, the photo library or a file. The one menu for
// attaching to a message and for choosing an avatar.
export function ImageSourceMenu({ onPick, opensUp = false, ...menu }: Props) {
  const { t } = useTranslation()
  // The desktop has no camera or photo library to tell apart from files: it opens the file dialog.
  if (isWeb) {
    return (
      <TapTrigger onPress={() => onPick('files')} disabled={menu.disabled} style={menu.style}>
        {menu.children}
      </TapTrigger>
    )
  }
  const items = [
    { label: t('attach.takePhoto'), systemImage: 'camera', onSelect: () => onPick('camera') },
    { label: t('attach.choosePhoto'), systemImage: 'photo.on.rectangle', onSelect: () => onPick('library') },
    { label: t('attach.chooseFile'), systemImage: 'folder', onSelect: () => onPick('files') },
  ]
  return <NativeMenu {...menu} items={opensUp && swiftUI ? items.reverse() : items} />
}
