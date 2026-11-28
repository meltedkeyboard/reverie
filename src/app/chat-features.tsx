import { ListSection, SwitchCell } from '@/components/lists/GroupedList'
import { NativeSection } from '@/components/lists/NativeForm'
import { SettingsSubpage } from '@/components/lists/SettingsSubpage'
import { isAttachTimerEnabled, isDirectionEnabled, isPersonasEnabled, setAttachTimerEnabled, setDirectionEnabled, setPersonasEnabled } from '@/db/prefs/features'
import { loadLongMemory, saveLongMemory } from '@/db/prefs/memory'
import { isPrivateChatEnabled, setPrivateChatEnabled } from '@/db/prefs/privateChat'
import { isSuggestionsEnabled, setSuggestionsEnabled } from '@/db/prefs/suggestions'
import { isAttachGalleryEnabled, isRecentAttachmentsEnabled, setAttachGalleryEnabled, setRecentAttachmentsEnabled } from '@/db/recentAttachments'
import { useNotifications } from '@/hooks/features/useNotifications'
import { useStoredFlag } from '@/hooks/util/useStoredFlag'
import { useTranslation } from '@/i18n'

export default function ChatFeaturesSettingsScreen() {
  const { t } = useTranslation()
  const notifications = useNotifications()
  const [privateButton, togglePrivateButton] = useStoredFlag(isPrivateChatEnabled, setPrivateChatEnabled, true)
  const [longMemory, toggleLongMemory] = useStoredFlag(loadLongMemory, saveLongMemory, false)
  const [suggestions, toggleSuggestions] = useStoredFlag(isSuggestionsEnabled, setSuggestionsEnabled, false)
  const [personasOn, togglePersonas] = useStoredFlag(isPersonasEnabled, setPersonasEnabled, true)
  const [directionOn, toggleDirection] = useStoredFlag(isDirectionEnabled, setDirectionEnabled, true)
  const [recentPictures, toggleRecentPictures] = useStoredFlag(isRecentAttachmentsEnabled, setRecentAttachmentsEnabled, true)
  const [attachGallery, toggleAttachGallery] = useStoredFlag(isAttachGalleryEnabled, setAttachGalleryEnabled, true)
  const [attachTimer, toggleAttachTimer] = useStoredFlag(isAttachTimerEnabled, setAttachTimerEnabled, true)

  return (
    <SettingsSubpage
      title={t('settings.featuresTitle')}
      native={({ ui }) => {
        const { Toggle } = ui
        return (
          <>
            <NativeSection title={t('settings.inChatTitle')}>
              <Toggle label={t('settings.privateButton')} isOn={privateButton} onIsOnChange={togglePrivateButton} />
              <Toggle label={t('memory.long')} isOn={longMemory} onIsOnChange={toggleLongMemory} />
              <Toggle label={t('settings.suggestButton')} isOn={suggestions} onIsOnChange={toggleSuggestions} />
            </NativeSection>

            <NativeSection title={t('settings.attachMenuTitle')} footer={t('settings.featuresNote')}>
              <Toggle label={t('settings.personasOn')} isOn={personasOn} onIsOnChange={togglePersonas} />
              <Toggle label={t('direction.title')} isOn={directionOn} onIsOnChange={toggleDirection} />
              <Toggle label={t('settings.recentPictures')} isOn={recentPictures} onIsOnChange={toggleRecentPictures} />
              <Toggle label={t('settings.attachGallery')} isOn={attachGallery} onIsOnChange={toggleAttachGallery} />
              {notifications.available ? <Toggle label={t('settings.attachTimer')} isOn={attachTimer} onIsOnChange={toggleAttachTimer} /> : null}
            </NativeSection>
          </>
        )
      }}
      fallback={
        <>
          <ListSection header={t('settings.inChatTitle')}>
            <SwitchCell label={t('settings.privateButton')} value={privateButton} onValueChange={togglePrivateButton} />
            <SwitchCell label={t('memory.long')} value={longMemory} onValueChange={toggleLongMemory} />
            <SwitchCell label={t('settings.suggestButton')} value={suggestions} onValueChange={toggleSuggestions} />
          </ListSection>

          <ListSection header={t('settings.attachMenuTitle')} footer={t('settings.featuresNote')}>
            <SwitchCell label={t('settings.personasOn')} value={personasOn} onValueChange={togglePersonas} />
            <SwitchCell label={t('direction.title')} value={directionOn} onValueChange={toggleDirection} />
            <SwitchCell label={t('settings.recentPictures')} value={recentPictures} onValueChange={toggleRecentPictures} />
            <SwitchCell label={t('settings.attachGallery')} value={attachGallery} onValueChange={toggleAttachGallery} />
            {notifications.available ? <SwitchCell label={t('settings.attachTimer')} value={attachTimer} onValueChange={toggleAttachTimer} /> : null}
          </ListSection>
        </>
      }
    />
  )
}
