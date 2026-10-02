import type { MenuItem } from '@/components/NativeMenu'
import { useTranslation } from '@/i18n'
import { errorMessage } from '@/lib/errors'
import { exportCharacterCard, type CardCharacter } from '@/lib/importCard'
import { showToast } from '@/lib/toast'

// The "save the card to Files / to Photos" choices, with the toast that follows. `load`
// gives the character at the moment of choosing, so a screen can hand over what is saved.
export function useCardExport() {
  const { t } = useTranslation()

  const run = async (load: () => Promise<CardCharacter | null | undefined>, target: 'files' | 'photos') => {
    try {
      const character = await load()
      if (!character) return
      const saved = await exportCharacterCard(character, target)
      if (saved) showToast({ tone: 'success', title: t('card.exportDone'), message: `${saved.name} · ${saved.folder}` })
    } catch (err) {
      showToast({ tone: 'error', title: t('card.exportFailed'), message: errorMessage(err) })
    }
  }

  const exportTargets = (load: () => Promise<CardCharacter | null | undefined>): MenuItem[] => [
    { label: t('card.saveToFiles'), systemImage: 'folder', onSelect: () => run(load, 'files') },
    { label: t('card.saveToPhotos'), systemImage: 'photo', onSelect: () => run(load, 'photos') },
  ]

  // The same two choices as one item that unfolds, for a menu that has other items too.
  const exportItem = (load: () => Promise<CardCharacter | null | undefined>): MenuItem => ({
    label: t('card.export'),
    systemImage: 'square.and.arrow.up',
    children: exportTargets(load),
  })

  return { exportTargets, exportItem }
}
