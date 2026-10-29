import { View } from 'react-native'

import { useTranslation } from '@/i18n'
import { useColors } from '@/theme'

import { SFIcon } from './SFIcon'

// The box of the archive after a name: a character put away, shown where the lists do not
// hide it (search, a room's cast, the backup's tree).
export function ArchivedMark({ size = 13 }: { size?: number }) {
  const colors = useColors()
  const { t } = useTranslation()
  return (
    <View accessible accessibilityLabel={t('archive.archived')}>
      <SFIcon name="archivebox" fallback="archive-outline" size={size} color={colors.textFaint} />
    </View>
  )
}
