import type { ComponentProps } from 'react'

import { useTranslation } from '@/i18n'
import type { ImageSource } from '@/lib/images/images'
import { swiftUI } from '@/lib/ui/nativeUI'

import { NativeMenu, TapTrigger } from './NativeMenu'
import { isWeb } from '@/lib/core/platform'

type Props = Omit<ComponentProps<typeof NativeMenu>, 'items'> & {
  onPick: (source: ImageSource) => void
  onGallery?: () => void
  galleryLabel?: string
  // For a menu that opens above its button: iOS lists such a menu bottom to top, so the
  // items are turned round to still read camera, photo, file from the top.
  opensUp?: boolean
}

// Where a picture comes from: the camera, the photo library, a file, or a gallery when offered.
export function ImageSourceMenu({ onPick, onGallery, galleryLabel, opensUp = false, ...menu }: Props) {
  const { t } = useTranslation()
  const galleryItem = onGallery
    ? [{ label: galleryLabel ?? t('gallery.title'), systemImage: 'photo.on.rectangle.angled', onSelect: onGallery }]
    : []
  // The desktop has no camera or photo library to tell apart from files: it opens the file dialog
  // directly unless a gallery choice is offered alongside it.
  if (isWeb) {
    if (onGallery) {
      return (
        <NativeMenu
          {...menu}
          items={[{ label: t('attach.chooseFile'), systemImage: 'folder', onSelect: () => onPick('files') }, ...galleryItem]}
        />
      )
    }
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
    ...galleryItem,
  ]
  return <NativeMenu {...menu} items={opensUp && swiftUI ? items.reverse() : items} />
}
