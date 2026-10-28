import { StyleSheet } from 'react-native'

import { GlassButton } from '@/components/chrome/Glass'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useTranslation } from '@/i18n'
import { confirmDeletion, isConfirmDeleteOn } from '@/lib/settings/confirmDelete'
import { liquidGlass } from '@/lib/ui/nativeUI'
import { useTheme } from '@/theme'

import { ConfirmButtonView } from '../../../modules/reverie-confirm'

type Props = {
  // What deleting does, in a sentence, and the label of the button that does it.
  message: string
  action: string
  accessibilityLabel: string
  onConfirm: () => void
}

// The round glass button that deletes the picture shown. With Liquid Glass it is UIKit's own
// glass button, and the question comes out of it as in Photos: an action sheet with the button
// as its source, which iOS 26 opens from the button as a line of what will happen over the
// destructive button (see modules/reverie-confirm). Elsewhere the glass button asks with an
// alert. When deleting is set not to ask in Settings, a tap deletes at once.
export function RemoveButton({ message, action, accessibilityLabel, onConfirm }: Props) {
  const { colors, scheme } = useTheme()
  const { t } = useTranslation()

  if (ConfirmButtonView && liquidGlass) {
    return (
      <ConfirmButtonView
        style={styles.button}
        systemImage="trash"
        iconColor={colors.text}
        dark={scheme === 'dark'}
        label={accessibilityLabel}
        message={message}
        action={action}
        cancel={t('common.cancel')}
        asks={isConfirmDeleteOn()}
        onConfirm={onConfirm}
      />
    )
  }

  return (
    <GlassButton
      icon="trash-outline"
      onPress={() => confirmDeletion({ title: message, confirmLabel: action, onConfirm })}
      accessibilityLabel={accessibilityLabel}
    >
      <SFIcon name="trash" fallback="trash-outline" size={19} color={colors.text} />
    </GlassButton>
  )
}

const styles = StyleSheet.create({
  // The 44 pt of the other glass buttons.
  button: { width: 44, height: 44 },
})
