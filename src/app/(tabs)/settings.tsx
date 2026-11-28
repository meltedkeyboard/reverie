import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState, type ComponentProps, type ComponentRef } from 'react'
import { AppState, Linking, ScrollView, StyleSheet, View } from 'react-native'

import { GlassHeader, TabTitle, useHeaderHeight, useScreenPadding } from '@/components/chrome/GlassHeader'
import { ButtonCell, LinkCell, ListSection, SettingsIcon, ValueCell } from '@/components/lists/GroupedList'
import { nativeForm, NativeActionRow, NativeForm, NativeHostedRow, NativeLinkRow, NativeSection } from '@/components/lists/NativeForm'
import { ChipRowCell } from '@/components/lists/PictureCells'
import { BackupTreeSheet } from '@/components/overlays/BackupTreeSheet'
import { Flash } from '@/components/overlays/Flash'
import { Icon } from '@/components/visuals/Icon'
import { SFIcon } from '@/components/visuals/SFIcon'
import { listCharacters } from '@/db/characters'
import { listLorebooks } from '@/db/lorebooks'
import { listPersonas, onPersonasChanged, type Persona } from '@/db/personas'
import { useGalleryLayout } from '@/db/prefs/galleryLook'
import { DEFAULT_SETTINGS, loadSettings, serverName, type ContextLimits } from '@/db/prefs/settings'
import { useDatabase } from '@/db/provider'
import { useBackupImport } from '@/hooks/features/useBackupImport'
import { useCloudSync } from '@/hooks/features/useCloudSync'
import { useNotifications } from '@/hooks/features/useNotifications'
import { useServers } from '@/hooks/features/useServers'
import { useTranslation } from '@/i18n'
import { useChatTextSettings } from '@/lib/chat/chatText'
import { formatTokensLabel } from '@/lib/core/context'
import { isDesktop } from '@/lib/core/platform'
import type { SettingsSection } from '@/lib/core/searchScope'
import { APP_COPYRIGHT, APP_VERSION_BUILD, ISSUES_URL, REPO_URL } from '@/lib/core/version'
import { alternateIconsAvailable } from '@/lib/settings/appIcons'
import { exportBackup, loadBackupTree, wipeAllData } from '@/lib/transfer/backup'
import type { BackupTree, Selection } from '@/lib/transfer/backupSelection'
import { reportError } from '@/lib/transfer/report'
import { confirm } from '@/lib/ui/dialogs'
import { NotificationFeedbackType, notificationAsync } from '@/lib/ui/haptics'
import { showToast } from '@/lib/ui/toast'
import { HEADER_ROW_HEIGHT, useStyles, useTheme, type Colors } from '@/theme'

type SettingsRoute =
  | '/servers'
  | '/context'
  | '/notifications'
  | '/sync'
  | '/theme'
  | '/chat-text'
  | '/chat-background'
  | '/gallery-layout'
  | '/app-icon'
  | '/general'
  | '/chat-features'
  | '/suggestions'
  | '/feedback'
  | '/archive'
  | '/personas'
  | '/lorebooks'

type NavRow = {
  key: string
  label: string
  value?: string
  symbol: ComponentProps<typeof SFIcon>['name']
  fallback: ComponentProps<typeof Icon>['name']
  route: SettingsRoute
}

export default function SettingsScreen() {
  const db = useDatabase()
  const router = useRouter()
  const padding = useScreenPadding('form')
  const styles = useStyles(createStyles)
  const { t } = useTranslation()
  const headerHeight = useHeaderHeight()
  const { section } = useLocalSearchParams<{ section?: SettingsSection }>()
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const offsets = useRef<Partial<Record<SettingsSection, number>>>({})
  const [flashed, setFlashed] = useState<{ section: SettingsSection; n: number } | null>(null)
  const jumpTo = nativeForm?.ui.useNativeState<string | null>(null)

  const [context, setContext] = useState<ContextLimits | null>(null)
  const [lorebookCount, setLorebookCount] = useState(0)
  const [archivedCount, setArchivedCount] = useState(0)
  const [personas, setPersonas] = useState<Persona[]>([])

  const { servers, activeId } = useServers()
  const activeServer = servers?.find((s) => s.id === activeId)
  const activeServerLabel = activeServer ? serverName(activeServer) || t('servers.untitled') : t('servers.none')
  const { theme, mode, colors } = useTheme()
  const chatText = useChatTextSettings()
  const galleryLayout = useGalleryLayout()
  const cloudSync = useCloudSync()
  const notifications = useNotifications()

  const reloadSummaries = useCallback(() => {
    loadSettings(db).then(({ limitMessages, chatMessages, roomMessages }) => setContext({ limitMessages, chatMessages, roomMessages }))
    listLorebooks(db).then((list) => setLorebookCount(list.length))
    listCharacters(db, true).then((list) => setArchivedCount(list.length))
  }, [db])

  useFocusEffect(reloadSummaries)

  useEffect(() => {
    let alive = true
    const load = () => {
      listPersonas(db).then((list) => {
        if (alive) setPersonas(list)
      })
    }
    load()
    const unsub = onPersonasChanged(load)
    return () => {
      alive = false
      unsub()
    }
  }, [db])

  const loaded = context !== null
  const cfg: ContextLimits = context ?? DEFAULT_SETTINGS
  const contextTokens = activeServer?.contextTokens ?? DEFAULT_SETTINGS.contextTokens

  const targetSection: SettingsSection | undefined =
    section === 'server' || section === 'folderSync'
      ? 'core'
      : section === 'gallery'
        ? 'appearance'
        : section === 'language' ||
            section === 'continue' ||
            section === 'confirmDelete' ||
          section === 'features' ||
          section === 'private' ||
          section === 'memory' ||
          section === 'personas' ||
          section === 'direction' ||
          section === 'attachGallery' ||
          section === 'attachTimer' ||
          section === 'suggest' ||
          section === 'haptics'
        ? 'chats'
        : section === 'archive'
          ? 'library'
          : section

  const jump = useCallback(() => {
    if (jumpTo) {
      if (!targetSection) return
      jumpTo.set(null)
      jumpTo.set(targetSection)
      router.setParams({ section: undefined })
      return
    }
    const y = targetSection && offsets.current[targetSection]
    if (!targetSection || y === undefined) return
    scrollRef.current?.scrollTo({ y: Math.max(0, y - headerHeight - 16), animated: true })
    setFlashed((prev) => ({ section: targetSection, n: (prev?.n ?? 0) + 1 }))
    router.setParams({ section: undefined })
  }, [targetSection, headerHeight, router, jumpTo])

  useEffect(() => {
    jump()
  }, [jump])

  const block = (id: SettingsSection, children: React.ReactNode) => (
    <View
      onLayout={(e) => {
        offsets.current[id] = e.nativeEvent.layout.y
        if (id === targetSection) jump()
      }}
    >
      {flashed?.section === id ? <Flash key={flashed.n} style={styles.flash} /> : null}
      {children}
    </View>
  )

  const [exporting, setExporting] = useState(false)
  const backupImport = useBackupImport()
  const importing = backupImport.importing
  const backingUp = exporting || importing
  const [wiping, setWiping] = useState(false)
  const [exportTree, setExportTree] = useState<BackupTree | null>(null)
  const [thanked, setThanked] = useState(false)
  const awayToStar = useRef(false)

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !awayToStar.current) return
      awayToStar.current = false
      setThanked(true)
      notificationAsync(NotificationFeedbackType.Success)
    })
    return () => sub.remove()
  }, [])

  const onExport = async () => {
    setExporting(true)
    try {
      setExportTree(await loadBackupTree(db))
    } catch (err) {
      reportError(t('settings.exportFailedTitle'), err)
    } finally {
      setExporting(false)
    }
  }

  const runExport = async (selection: Selection) => {
    setExportTree(null)
    setExporting(true)
    try {
      const saved = await exportBackup(db, selection)
      if (saved) {
        showToast({
          tone: 'success',
          title: t('settings.exportDoneTitle'),
          message: t('settings.exportDoneMessage', { name: saved.name, folder: saved.folder }),
        })
      }
    } catch (err) {
      reportError(t('settings.exportFailedTitle'), err)
    } finally {
      setExporting(false)
    }
  }

  const onWipe = () => {
    confirm({
      title: t('settings.wipeConfirmTitle'),
      message: t('settings.wipeConfirmMessage'),
      confirmLabel: t('settings.wipeConfirmLabel'),
      destructive: true,
      onConfirm: async () => {
        setWiping(true)
        try {
          await wipeAllData(db)
          router.replace('/onboarding')
        } catch (err) {
          reportError(t('settings.wipeFailedTitle'), err)
        } finally {
          setWiping(false)
        }
      },
    })
  }

  const openRepo = () => {
    if (isDesktop) setThanked(true)
    else awayToStar.current = true
    Linking.openURL(REPO_URL).catch((err) => {
      awayToStar.current = false
      reportError(t('settings.starOnGithub'), err)
    })
  }
  const openIssues = () => Linking.openURL(ISSUES_URL).catch((err) => reportError(t('settings.reportBug'), err))

  const star = thanked
    ? { label: t('settings.starThanks'), symbol: 'heart.fill' as const, fallback: 'heart' as const }
    : { label: t('settings.starOnGithub'), symbol: 'star' as const, fallback: 'star-outline' as const }

  const cloudPreview = __DEV__ && !cloudSync.available
  const showCloud = cloudSync.available || cloudPreview
  const destinationLabel =
    cloudSync.provider === 'smb'
      ? cloudSync.smb.host || undefined
      : cloudSync.folder || undefined

  const contextValue = activeServer
    ? formatTokensLabel(contextTokens)
    : cfg.limitMessages
      ? String(cfg.chatMessages)
      : t('settings.stateOff')

  const themeValue = `${t(`theme.${theme}`)}, ${t(`theme.${mode}`)}`
  const fontValue = `${chatText.font === 'System' ? t('chatFont.system') : chatText.font}, ${Math.round(chatText.scale * 100)}%`
  const backgroundValue = chatText.pattern === 'custom' && chatText.wallpaper?.file ? t('chatPattern.custom') : t('chatPattern.none')

  const coreRows: NavRow[] = [
    { key: 'servers', label: t('servers.title'), value: activeServerLabel, symbol: 'server.rack', fallback: 'server-outline', route: '/servers' },
    { key: 'context', label: t('settings.contextLabel'), value: contextValue, symbol: 'square.stack.3d.up', fallback: 'layers-outline', route: '/context' },
    ...(notifications.available
      ? [{ key: 'notifications', label: t('notifications.title'), symbol: 'bell.badge' as const, fallback: 'notifications-outline' as const, route: '/notifications' as const }]
      : []),
    ...(showCloud
      ? [{ key: 'sync', label: t('sync.title'), value: destinationLabel, symbol: 'icloud' as const, fallback: 'cloud-outline' as const, route: '/sync' as const }]
      : []),
  ]

  const appearanceRows: NavRow[] = [
    { key: 'theme', label: t('settings.themeScreen'), value: themeValue, symbol: 'paintbrush', fallback: 'color-palette-outline', route: '/theme' },
    { key: 'font', label: t('settings.fontScreen'), value: fontValue, symbol: 'textformat.size', fallback: 'text-outline', route: '/chat-text' },
    { key: 'bg', label: t('settings.backgroundScreen'), value: backgroundValue, symbol: 'photo', fallback: 'image-outline', route: '/chat-background' },
    { key: 'gallery', label: t('settings.galleryLayout'), value: t(galleryLayout === 'carousel' ? 'settings.galleryCarousel' : 'settings.galleryGrid'), symbol: 'rectangle.stack', fallback: 'images-outline', route: '/gallery-layout' },
    ...(alternateIconsAvailable
      ? [{ key: 'icon', label: t('settings.appIcon'), symbol: 'app.badge' as const, fallback: 'apps-outline' as const, route: '/app-icon' as const }]
      : []),
  ]

  const chatRows: NavRow[] = [
    { key: 'general', label: t('settings.generalTitle'), symbol: 'gearshape', fallback: 'settings-outline', route: '/general' },
    { key: 'features', label: t('settings.featuresTitle'), symbol: 'switch.2', fallback: 'options-outline', route: '/chat-features' },
    { key: 'suggestions', label: t('settings.suggestButton'), symbol: 'text.bubble', fallback: 'chatbubble-ellipses-outline', route: '/suggestions' },
    { key: 'feedback', label: t('settings.feedback'), symbol: 'iphone.radiowaves.left.and.right', fallback: 'phone-portrait-outline', route: '/feedback' },
  ]

  const libraryRows: NavRow[] = [
    { key: 'archive', label: t('archive.title'), value: archivedCount > 0 ? String(archivedCount) : undefined, symbol: 'archivebox', fallback: 'archive-outline', route: '/archive' },
    { key: 'personas', label: t('persona.title'), value: personas.length > 0 ? String(personas.length) : undefined, symbol: 'theatermasks', fallback: 'happy-outline', route: '/personas' },
    { key: 'lorebooks', label: t('lore.title'), value: lorebookCount > 0 ? String(lorebookCount) : undefined, symbol: 'books.vertical', fallback: 'book-outline', route: '/lorebooks' },
  ]

  const cloudBusy = cloudSync.syncing || backingUp

  const backupChips = (
    <ChipRowCell
      actions={[
        {
          label: t('settings.exportJson'),
          icon: { symbol: 'square.and.arrow.up', fallback: 'share-outline' },
          labeled: true,
          onPress: onExport,
          loading: exporting,
          disabled: cloudBusy || importing,
        },
        {
          label: t('settings.importJson'),
          icon: { symbol: 'square.and.arrow.down', fallback: 'download-outline' },
          labeled: true,
          onPress: backupImport.pick,
          loading: importing,
          disabled: cloudBusy || exporting,
        },
      ]}
    />
  )

  const backupSheets = (
    <>
      <BackupTreeSheet tree={exportTree} confirmLabel={t('settings.exportJson')} onConfirm={runExport} onClose={() => setExportTree(null)} />
      {backupImport.sheet}
    </>
  )

  const renderLinkRows = (rows: NavRow[]) =>
    rows.map((row) => (
      <LinkCell
        key={row.key}
        label={row.label}
        value={row.value}
        leading={<SettingsIcon symbol={row.symbol} fallback={row.fallback} />}
        onPress={() => router.push(row.route)}
      />
    ))

  const renderNativeLinkRows = (rows: NavRow[]) =>
    rows.map((row) => (
      <NativeLinkRow
        key={row.key}
        label={row.label}
        value={row.value}
        symbol={row.symbol}
        color={colors.accent}
        onPress={() => router.push(row.route)}
      />
    ))

  const renderNative = ({ ui }: NonNullable<typeof nativeForm>) => {
    const { Text: SwiftText, LabeledContent } = ui
    return (
      <NativeForm jumpTo={jumpTo}>
        <NativeSection id="core" inset={HEADER_ROW_HEIGHT}>
          {renderNativeLinkRows(coreRows)}
        </NativeSection>

        <NativeSection id="appearance" title={t('settings.appearance')}>
          {renderNativeLinkRows(appearanceRows)}
        </NativeSection>

        <NativeSection id="chats" title={t('settings.chats')}>
          {renderNativeLinkRows(chatRows)}
        </NativeSection>

        <NativeSection id="library" title={t('settings.libraryTitle')}>
          {renderNativeLinkRows(libraryRows)}
        </NativeSection>

        <NativeSection id="backup" title={t('settings.backupTitle')} footer={t('settings.backupNote')}>
          <NativeHostedRow>{backupChips}</NativeHostedRow>
        </NativeSection>

        <NativeSection id="about" title={t('settings.aboutTitle')} footer={t('settings.starNote')}>
          <LabeledContent label={t('settings.version')}>
            <SwiftText>{APP_VERSION_BUILD}</SwiftText>
          </LabeledContent>
          <LabeledContent label={t('settings.copyright')}>
            <SwiftText>{APP_COPYRIGHT}</SwiftText>
          </LabeledContent>
          <NativeActionRow label={star.label} symbol={star.symbol} onPress={openRepo} />
          <NativeActionRow label={t('settings.reportBug')} symbol="ladybug" onPress={openIssues} />
        </NativeSection>

        <NativeSection id="wipe" title={t('settings.dangerZone')} footer={t('settings.dangerNote')}>
          <NativeActionRow label={t('settings.wipeAll')} destructive busy={wiping} onPress={onWipe} />
        </NativeSection>
      </NativeForm>
    )
  }

  return (
    <View style={styles.screen}>
      {loaded && nativeForm ? (
        <>
          {renderNative(nativeForm)}
          {backupSheets}
        </>
      ) : loaded ? (
        <ScrollView ref={scrollRef} contentContainerStyle={padding}>
          {block('core', <ListSection>{renderLinkRows(coreRows)}</ListSection>)}
          {block('appearance', <ListSection header={t('settings.appearance')}>{renderLinkRows(appearanceRows)}</ListSection>)}
          {block('chats', <ListSection header={t('settings.chats')}>{renderLinkRows(chatRows)}</ListSection>)}
          {block('library', <ListSection header={t('settings.libraryTitle')}>{renderLinkRows(libraryRows)}</ListSection>)}
          {block(
            'backup',
            <>
              <ListSection header={t('settings.backupTitle')} footer={t('settings.backupNote')}>
                {backupChips}
              </ListSection>
              {backupSheets}
            </>
          )}
          {block(
            'about',
            <ListSection header={t('settings.aboutTitle')} footer={t('settings.starNote')}>
              <ValueCell label={t('settings.version')} value={APP_VERSION_BUILD} />
              <ValueCell label={t('settings.copyright')} value={APP_COPYRIGHT} />
              <ButtonCell label={star.label} icon={{ symbol: star.symbol, fallback: star.fallback }} onPress={openRepo} />
              <ButtonCell label={t('settings.reportBug')} icon={{ symbol: 'ladybug', fallback: 'bug-outline' }} onPress={openIssues} />
            </ListSection>
          )}
          {block(
            'wipe',
            <ListSection header={t('settings.dangerZone')} footer={t('settings.dangerNote')}>
              <ButtonCell danger label={t('settings.wipeAll')} onPress={onWipe} loading={wiping} />
            </ListSection>
          )}
        </ScrollView>
      ) : null}

      <GlassHeader floating centerTitle tabHeader>
        <TabTitle>{t('settings.title')}</TabTitle>
      </GlassHeader>
    </View>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    flash: { top: -8, bottom: -8, left: -10, right: -10, borderRadius: 30 },
  })
