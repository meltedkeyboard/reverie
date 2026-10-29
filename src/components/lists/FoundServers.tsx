import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import type { FoundServer } from '@/api/discover'
import { ButtonCell, ListSection } from '@/components/lists/GroupedList'
import { NativeActionRow, NativeSection, nativeForm } from '@/components/lists/NativeForm'
import { SFIcon } from '@/components/visuals/SFIcon'
import { serverHost } from '@/db/prefs/settings'
import type { useServerDiscovery } from '@/hooks/features/useServerDiscovery'
import { useTranslation } from '@/i18n'
import { type Colors, useColors, useStyles } from '@/theme'

// What stands at the end of a found server's row: the check of the one picked, a plus to
// add it, a grey check for one already in the list, or nothing.
export type FoundMark = 'picked' | 'add' | 'added' | null

type Props = {
  discovery: ReturnType<typeof useServerDiscovery>
  markOf: (server: FoundServer) => FoundMark
  onPick: (server: FoundServer) => void
}

function useLines({ discovery }: Pick<Props, 'discovery'>) {
  const { t } = useTranslation()
  const { state, found } = discovery
  const detail = (server: FoundServer) =>
    [
      serverHost(server.baseUrl),
      server.locked ? t('discover.locked') : server.models.length ? t('discover.models', { count: server.models.length }) : '',
    ]
      .filter(Boolean)
      .join(' · ')
  const action =
    state === 'searching'
      ? t('discover.searching')
      : state === 'idle'
        ? t('discover.search')
        : t('discover.again')
  const footer =
    state === 'noWifi'
      ? t('discover.noWifi')
      : state === 'done' && !found.length
        ? t('discover.nothing')
        : t('discover.hint')
  return { detail, action, footer }
}

// The model servers a search of the local network found, as a group of the system's list
// (iOS with SwiftUI): each a row that is picked or added on a tap, and under them the row
// that searches, its antenna waving while it does.
export function FoundServersSection({ discovery, markOf, onPick }: Props) {
  const colors = useColors()
  const { t } = useTranslation()
  const { detail, action, footer } = useLines({ discovery })
  const { Button, HStack, VStack, Spacer, Text: SwiftText, Image } = nativeForm!.ui
  const { tint, font, foregroundStyle, lineLimit, disabled } = nativeForm!.modifiers
  const secondary = { type: 'hierarchical', style: 'secondary' } as const
  return (
    <NativeSection title={t('discover.title')} footer={footer}>
      {discovery.found.map((server) => {
        const mark = markOf(server)
        return (
          <Button
            key={server.baseUrl}
            onPress={() => onPick(server)}
            modifiers={[tint(colors.text), disabled(mark === 'added')]}
          >
            <HStack spacing={12}>
              <VStack alignment="leading" spacing={2}>
                <SwiftText modifiers={[lineLimit(1)]}>{server.kind}</SwiftText>
                <SwiftText modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle(secondary), lineLimit(1)]}>{detail(server)}</SwiftText>
              </VStack>
              <Spacer />
              {mark === 'picked' ? <Image systemName="checkmark" size={17} color={colors.accent} /> : null}
              {mark === 'add' ? <Image systemName="plus.circle.fill" size={22} color={colors.accent} /> : null}
              {mark === 'added' ? <Image systemName="checkmark.circle" size={20} color={colors.textFaint} /> : null}
            </HStack>
          </Button>
        )
      })}
      <NativeActionRow
        label={action}
        symbol="dot.radiowaves.left.and.right"
        effect={{ effect: 'variableColor' }}
        busy={discovery.state === 'searching'}
        onPress={discovery.search}
      />
    </NativeSection>
  )
}

// The same group drawn by the app, where the system's list is not there.
export function FoundServersGroup({ discovery, markOf, onPick }: Props) {
  const colors = useColors()
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const { detail, action, footer } = useLines({ discovery })
  return (
    <ListSection header={t('discover.title')} footer={footer}>
      {discovery.found.map((server) => {
        const mark = markOf(server)
        return (
          <Pressable
            key={server.baseUrl}
            disabled={mark === 'added'}
            accessibilityRole="button"
            accessibilityState={{ selected: mark === 'picked', disabled: mark === 'added' }}
            onPress={() => onPick(server)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {server.kind}
              </Text>
              <Text style={styles.detail} numberOfLines={1}>
                {detail(server)}
              </Text>
            </View>
            {mark === 'picked' ? <SFIcon name="checkmark" fallback="checkmark" size={20} color={colors.accent} /> : null}
            {mark === 'add' ? <SFIcon name="plus.circle.fill" fallback="add-circle" size={24} color={colors.accent} /> : null}
            {mark === 'added' ? <SFIcon name="checkmark.circle" fallback="checkmark-circle-outline" size={22} color={colors.textFaint} /> : null}
          </Pressable>
        )
      })}
      {discovery.state === 'searching' ? (
        <View style={styles.row}>
          <Text style={[styles.name, styles.searching]}>{action}</Text>
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ) : (
        <ButtonCell label={action} onPress={discovery.search} icon={{ symbol: 'dot.radiowaves.left.and.right', fallback: 'wifi' }} />
      )}
    </ListSection>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
    pressed: { backgroundColor: colors.surfaceRaised },
    info: { flex: 1, gap: 2 },
    name: { fontSize: 16, color: colors.text },
    detail: { fontSize: 13, color: colors.textMuted },
    searching: { flex: 1, color: colors.textMuted },
  })
