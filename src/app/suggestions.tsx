import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'

import { InputCell, ListFooter, ListSection, SegmentCell, SliderCell, SwitchCell } from '@/components/lists/GroupedList'
import { NativeSection, NativeSegmentRow, NativeSliderRow, NativeTextRow } from '@/components/lists/NativeForm'
import { SettingsSubpage } from '@/components/lists/SettingsSubpage'
import { Icon } from '@/components/visuals/Icon'
import { typedCount } from '@/db/prefs/settings'
import {
  isSuggestionsEnabled,
  isSuggestionImagesReferenceEnabled,
  loadSuggestionContextMode,
  loadSuggestionMessages,
  loadSuggestionTokens,
  saveSuggestionContextMode,
  saveSuggestionMessages,
  saveSuggestionTokens,
  setSuggestionsEnabled,
  setSuggestionImagesReferenceEnabled,
  SUGGESTION_MESSAGES,
  SUGGESTION_TOKENS,
  type SuggestionContextMode,
} from '@/db/prefs/suggestions'
import { useDatabase } from '@/db/provider'
import { useStoredFlag } from '@/hooks/util/useStoredFlag'
import { useTranslation } from '@/i18n'
import { selectionAsync } from '@/lib/ui/haptics'
import { useColors } from '@/theme'

export default function SuggestionsSettingsScreen() {
  const db = useDatabase()
  const colors = useColors()
  const { t } = useTranslation()
  const [suggestions, toggleSuggestions] = useStoredFlag(isSuggestionsEnabled, setSuggestionsEnabled, false)
  const [suggestionImagesReference, toggleSuggestionImagesReference] = useStoredFlag(
    isSuggestionImagesReferenceEnabled,
    setSuggestionImagesReferenceEnabled,
    true
  )
  const [suggestionTokens, setSuggestionTokens] = useState<number>(SUGGESTION_TOKENS.default)
  const [suggestionContextMode, setSuggestionContextMode] = useState<SuggestionContextMode>('limit')
  const [suggestionMessages, setSuggestionMessages] = useState<number>(SUGGESTION_MESSAGES.default)
  const [suggestionMessagesDraft, setSuggestionMessagesDraft] = useState<string>()

  useEffect(() => {
    loadSuggestionTokens(db).then(setSuggestionTokens)
    loadSuggestionContextMode(db).then(setSuggestionContextMode)
    loadSuggestionMessages(db).then(setSuggestionMessages)
  }, [db])

  const modeOptions: { value: SuggestionContextMode; label: string }[] = [
    { value: 'limit', label: t('settings.suggestContextModeLimit') },
    { value: 'all', label: t('settings.suggestContextModeAll') },
  ]

  const pickMode = (mode: SuggestionContextMode) => {
    selectionAsync()
    setSuggestionContextMode(mode)
    saveSuggestionContextMode(db, mode)
  }

  const typeMessages = (text: string) => {
    const { digits, count } = typedCount(text)
    setSuggestionMessagesDraft(digits)
    if (!count) return
    setSuggestionMessages(count)
    saveSuggestionMessages(db, count)
  }

  return (
    <SettingsSubpage
      title={t('settings.suggestButton')}
      keyboard
      native={({ ui, modifiers }) => {
        const { HStack, Image, Text: SwiftText, Toggle, VStack } = ui
        const { disabled, foregroundStyle } = modifiers
        return (
          <>
            <NativeSection>
              <Toggle label={t('settings.suggestButton')} isOn={suggestions} onIsOnChange={toggleSuggestions} />
            </NativeSection>

            <NativeSection
              footerNode={
                <VStack alignment="leading" spacing={6}>
                  <SwiftText>{t('settings.suggestIntro')}</SwiftText>
                  <HStack spacing={10}>
                    <SwiftText modifiers={[foregroundStyle(colors.textMuted)]}>{t('settings.suggestSwipe')}</SwiftText>
                    <HStack spacing={3}>
                      <Image systemName="arrow.right" size={11} color={colors.textMuted} />
                      <SwiftText modifiers={[foregroundStyle(colors.textMuted)]}>{t('settings.suggestSwipeRight')}</SwiftText>
                    </HStack>
                    <HStack spacing={3}>
                      <Image systemName="arrow.left" size={11} color={colors.textMuted} />
                      <SwiftText modifiers={[foregroundStyle(colors.textMuted)]}>{t('settings.suggestSwipeLeft')}</SwiftText>
                    </HStack>
                    <HStack spacing={3}>
                      <Image systemName="arrow.up" size={11} color={colors.textMuted} />
                      <SwiftText modifiers={[foregroundStyle(colors.textMuted)]}>{t('settings.suggestSwipeUp')}</SwiftText>
                    </HStack>
                  </HStack>
                  {suggestions && suggestionContextMode === 'all' ? (
                    <SwiftText modifiers={[foregroundStyle(colors.danger)]}>{t('settings.suggestContextAllWarning')}</SwiftText>
                  ) : null}
                </VStack>
              }
            >
              <NativeSegmentRow
                label={t('settings.suggestContextMode')}
                options={modeOptions}
                value={suggestionContextMode}
                onChange={pickMode}
                disabled={!suggestions}
              />
              {suggestionContextMode === 'limit' ? (
                <NativeTextRow
                  label={t('settings.suggestMessagesCount')}
                  value={suggestionMessagesDraft ?? String(suggestionMessages)}
                  onChangeText={typeMessages}
                  keyboard="number-pad"
                  disabled={!suggestions}
                />
              ) : null}
              <NativeSliderRow
                label={t('settings.suggestTokens')}
                value={suggestionTokens}
                min={SUGGESTION_TOKENS.min}
                max={SUGGESTION_TOKENS.max}
                step={SUGGESTION_TOKENS.step}
                onChange={(tokens) => {
                  setSuggestionTokens(tokens)
                  saveSuggestionTokens(db, tokens)
                }}
                disabled={!suggestions}
              />
              <Toggle
                label={t('settings.suggestImagesReference')}
                isOn={suggestionImagesReference}
                onIsOnChange={toggleSuggestionImagesReference}
                modifiers={[disabled(!suggestions)]}
              />
            </NativeSection>
          </>
        )
      }}
      fallback={
        <>
          <ListSection>
            <SwitchCell label={t('settings.suggestButton')} value={suggestions} onValueChange={toggleSuggestions} />
          </ListSection>

          <ListSection
            footer={
              <>
                <ListFooter>{t('settings.suggestIntro')}</ListFooter>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingHorizontal: 16, marginTop: 4 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('settings.suggestSwipe')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Icon name="arrow-forward-outline" size={13} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('settings.suggestSwipeRight')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Icon name="arrow-back-outline" size={13} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('settings.suggestSwipeLeft')}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Icon name="arrow-up-outline" size={13} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('settings.suggestSwipeUp')}</Text>
                  </View>
                </View>
                {suggestions && suggestionContextMode === 'all' ? (
                  <ListFooter danger>{t('settings.suggestContextAllWarning')}</ListFooter>
                ) : null}
              </>
            }
          >
            <SegmentCell
              label={t('settings.suggestContextMode')}
              options={modeOptions}
              value={suggestionContextMode}
              onChange={pickMode}
              disabled={!suggestions}
            />
            {suggestionContextMode === 'limit' ? (
              <InputCell
                label={t('settings.suggestMessagesCount')}
                value={suggestionMessagesDraft ?? String(suggestionMessages)}
                onChangeText={typeMessages}
                keyboardType="number-pad"
                disabled={!suggestions}
              />
            ) : null}
            <SliderCell
              label={t('settings.suggestTokens')}
              value={suggestionTokens}
              min={SUGGESTION_TOKENS.min}
              max={SUGGESTION_TOKENS.max}
              step={SUGGESTION_TOKENS.step}
              onChange={(tokens) => {
                setSuggestionTokens(tokens)
                saveSuggestionTokens(db, tokens)
              }}
              disabled={!suggestions}
            />
            <SwitchCell
              label={t('settings.suggestImagesReference')}
              value={suggestionImagesReference}
              onValueChange={toggleSuggestionImagesReference}
              disabled={!suggestions}
            />
          </ListSection>
        </>
      }
    />
  )
}
