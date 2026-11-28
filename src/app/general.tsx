import { CheckCell, ListSection, SegmentCell, SwitchCell } from '@/components/lists/GroupedList'
import { NativeSection, NativeSegmentRow } from '@/components/lists/NativeForm'
import { SettingsSubpage } from '@/components/lists/SettingsSubpage'
import { isConfirmDeleteEnabled, setConfirmDeleteEnabled } from '@/db/prefs/confirmDelete'
import { isContinueByVisit, isContinueEnabled, setContinueByVisit, setContinueEnabled } from '@/db/prefs/continue'
import { useStoredFlag } from '@/hooks/util/useStoredFlag'
import { languagePickerAvailable, useTranslation, type LocalePreference } from '@/i18n'
import { selectionAsync } from '@/lib/ui/haptics'

export default function GeneralSettingsScreen() {
  const { t, preference: localePreference, setPreference: setLocalePreference } = useTranslation()
  const [continueButton, toggleContinueButton] = useStoredFlag(isContinueEnabled, setContinueEnabled, true)
  const [continueByVisit, setContinueByVisitValue] = useStoredFlag(isContinueByVisit, setContinueByVisit, true)
  const [confirmDelete, toggleConfirmDelete] = useStoredFlag(isConfirmDeleteEnabled, setConfirmDeleteEnabled, true)

  const languageOptions: { value: LocalePreference; label: string }[] = [
    { value: 'system', label: t('language.system') },
    { value: 'ru', label: t('language.ru') },
    { value: 'en', label: t('language.en') },
  ]
  const continueOptions: { value: 'visit' | 'message'; label: string }[] = [
    { value: 'visit', label: t('settings.continueByVisit') },
    { value: 'message', label: t('settings.continueByMessage') },
  ]

  return (
    <SettingsSubpage
      title={t('settings.generalTitle')}
      native={({ ui, modifiers }) => {
        const { Picker, Text: SwiftText, Toggle } = ui
        const { pickerStyle, labelsHidden, tag } = modifiers
        return (
          <>
            {languagePickerAvailable ? (
              <NativeSection title={t('settings.language')}>
                <Picker
                  selection={localePreference}
                  onSelectionChange={(next: LocalePreference) => {
                    selectionAsync()
                    setLocalePreference(next)
                  }}
                  modifiers={[pickerStyle('inline'), labelsHidden()]}
                >
                  {languageOptions.map((o) => (
                    <SwiftText key={o.value} modifiers={[tag(o.value)]}>
                      {o.label}
                    </SwiftText>
                  ))}
                </Picker>
              </NativeSection>
            ) : null}

            <NativeSection title={t('settings.homeScreen')} footer={t('settings.continueButtonNote')}>
              <Toggle label={t('settings.continueButton')} isOn={continueButton} onIsOnChange={toggleContinueButton} />
              <NativeSegmentRow
                label={t('settings.continueBy')}
                options={continueOptions}
                value={continueByVisit ? 'visit' : 'message'}
                onChange={(value) => {
                  selectionAsync()
                  setContinueByVisitValue(value === 'visit')
                }}
                disabled={!continueButton}
              />
            </NativeSection>

            <NativeSection>
              <Toggle label={t('settings.confirmDelete')} isOn={confirmDelete} onIsOnChange={toggleConfirmDelete} />
            </NativeSection>
          </>
        )
      }}
      fallback={
        <>
          {languagePickerAvailable ? (
            <ListSection header={t('settings.language')}>
              {languageOptions.map((o) => (
                <CheckCell key={o.value} label={o.label} checked={localePreference === o.value} onPress={() => setLocalePreference(o.value)} />
              ))}
            </ListSection>
          ) : null}

          <ListSection header={t('settings.homeScreen')} footer={t('settings.continueButtonNote')}>
            <SwitchCell label={t('settings.continueButton')} value={continueButton} onValueChange={toggleContinueButton} />
            <SegmentCell
              label={t('settings.continueBy')}
              options={continueOptions}
              value={continueByVisit ? 'visit' : 'message'}
              onChange={(value) => setContinueByVisitValue(value === 'visit')}
              disabled={!continueButton}
            />
          </ListSection>

          <ListSection>
            <SwitchCell label={t('settings.confirmDelete')} value={confirmDelete} onValueChange={toggleConfirmDelete} />
          </ListSection>
        </>
      }
    />
  )
}
