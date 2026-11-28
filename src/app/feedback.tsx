import { ListSection, SwitchCell } from '@/components/lists/GroupedList'
import { NativeSection } from '@/components/lists/NativeForm'
import { SettingsSubpage } from '@/components/lists/SettingsSubpage'
import { isHapticsEnabled, isStreamHapticsEnabled, isSuggestionHapticsEnabled, setHapticsEnabled, setStreamHapticsEnabled, setSuggestionHapticsEnabled } from '@/db/prefs/haptics'
import { useStoredFlag } from '@/hooks/util/useStoredFlag'
import { useTranslation } from '@/i18n'

export default function FeedbackSettingsScreen() {
  const { t } = useTranslation()
  const [haptics, toggleHaptics] = useStoredFlag(isHapticsEnabled, setHapticsEnabled, true)
  const [streamHaptics, toggleStreamHaptics] = useStoredFlag(isStreamHapticsEnabled, setStreamHapticsEnabled, true)
  const [suggestionHaptics, toggleSuggestionHaptics] = useStoredFlag(isSuggestionHapticsEnabled, setSuggestionHapticsEnabled, true)

  return (
    <SettingsSubpage
      title={t('settings.feedback')}
      native={({ ui, modifiers }) => {
        const { Toggle } = ui
        const { disabled } = modifiers
        return (
          <NativeSection footer={haptics ? t('settings.streamHapticsNote') : undefined}>
            <Toggle label={t('settings.haptics')} isOn={haptics} onIsOnChange={toggleHaptics} />
            <Toggle label={t('settings.streamHaptics')} isOn={streamHaptics} onIsOnChange={toggleStreamHaptics} modifiers={[disabled(!haptics)]} />
            <Toggle
              label={t('settings.suggestionHaptics')}
              isOn={suggestionHaptics}
              onIsOnChange={toggleSuggestionHaptics}
              modifiers={[disabled(!haptics)]}
            />
          </NativeSection>
        )
      }}
      fallback={
        <ListSection footer={haptics ? t('settings.streamHapticsNote') : undefined}>
          <SwitchCell label={t('settings.haptics')} value={haptics} onValueChange={toggleHaptics} />
          <SwitchCell label={t('settings.streamHaptics')} value={streamHaptics} onValueChange={toggleStreamHaptics} disabled={!haptics} />
          <SwitchCell label={t('settings.suggestionHaptics')} value={suggestionHaptics} onValueChange={toggleSuggestionHaptics} disabled={!haptics} />
        </ListSection>
      }
    />
  )
}
