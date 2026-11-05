import { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'

import { FormScreenHeader } from '@/components/chrome/FormScreenHeader'
import { useScreenPadding } from '@/components/chrome/GlassHeader'
import { ButtonCell, InputCell, ListSection, SegmentCell, SwitchCell } from '@/components/lists/GroupedList'
import { SmbFolderBrowser } from '@/components/sync/SmbFolderBrowser'
import { SFIcon } from '@/components/visuals/SFIcon'
import { useDatabase } from '@/db/provider'
import { getSmbPassword, getSmbSettings, saveSmbPassword, saveSmbSettings, type SmbSettings } from '@/db/prefs/cloudSync'
import { useCloudSync } from '@/hooks/features/useCloudSync'
import { useTranslation } from '@/i18n'
import { discoverSmbServers, listSmbShares, testSmbConnection, type DiscoveredSmbServer, type SmbConfig, type SmbTestResult } from '@/lib/transfer/smbClient'
import { showSheet } from '@/lib/ui/dialogs'
import * as Haptics from '@/lib/ui/haptics'
import { type Colors, useColors, useStyles } from '@/theme'

type AuthMode = 'user' | 'guest'

export default function SmbScreen() {
  const { t } = useTranslation()
  const db = useDatabase()
  const router = useRouter()
  const colors = useColors()
  const padding = useScreenPadding('form')
  const styles = useStyles(createStyles)
  const cloudSync = useCloudSync()

  // Form fields
  const [host, setHost] = useState('')
  const [port, setPort] = useState('445')
  const [share, setShare] = useState('')
  const [path, setPath] = useState('Reverie Sync')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [domain, setDomain] = useState('WORKGROUP')
  const [wifiOnly, setWifiOnly] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>('user')

  // Discovered servers in local network
  const [discovered, setDiscovered] = useState<DiscoveredSmbServer[]>([])
  const [scanning, setScanning] = useState(false)

  // Modals & testing
  const [browserVisible, setBrowserVisible] = useState(false)
  const [listingShares, setListingShares] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<SmbTestResult | null>(null)

  // Loaded initial state
  const loaded = useRef(false)

  // Load existing settings
  useEffect(() => {
    Promise.all([getSmbSettings(db), getSmbPassword(db)]).then(([settings, pass]) => {
      setHost(settings.host)
      setPort(String(settings.port || 445))
      setShare(settings.share)
      setPath(settings.path || 'Reverie Sync')
      setUsername(settings.username)
      setPassword(pass)
      setDomain(settings.domain || 'WORKGROUP')
      setWifiOnly(settings.wifiOnly)
      setAuthMode(settings.username ? 'user' : 'guest')
      loaded.current = true
    })
  }, [db])

  // Discover servers on local network
  useEffect(() => {
    const ctrl = new AbortController()
    setScanning(true)
    discoverSmbServers(ctrl.signal, (server) => {
      setDiscovered((prev) => (prev.some((s) => s.host === server.host) ? prev : [...prev, server]))
    }).finally(() => {
      setScanning(false)
    })
    return () => ctrl.abort()
  }, [])

  // Auto-save settings
  const persist = useCallback(
    async (override?: Partial<SmbSettings>, overridePass?: string) => {
      if (!loaded.current) return
      const s: Partial<SmbSettings> = {
        host: host.trim(),
        port: parseInt(port, 10) || 445,
        share: share.trim(),
        path: path.trim(),
        username: authMode === 'user' ? username.trim() : '',
        domain: domain.trim(),
        wifiOnly,
        ...override,
      }
      await saveSmbSettings(db, s)
      const passToSave = overridePass !== undefined ? overridePass : (authMode === 'user' ? password : '')
      await saveSmbPassword(db, passToSave)
      cloudSync.refresh().catch(() => {})
    },
    [db, host, port, share, path, authMode, username, password, domain, wifiOnly, cloudSync]
  )

  useEffect(() => {
    if (loaded.current) {
      persist()
    }
  }, [host, port, share, path, username, password, domain, wifiOnly, authMode, persist])

  const currentConfig: SmbConfig = {
    host: host.trim(),
    port: parseInt(port, 10) || 445,
    share: share.trim(),
    path: path.trim(),
    username: authMode === 'user' ? username.trim() : '',
    password: authMode === 'user' ? password : '',
    domain: domain.trim(),
  }

  const pickDiscovered = (serverHost: string) => {
    Haptics.selectionAsync()
    setHost(serverHost)
  }

  const onPickShare = async () => {
    if (!host.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }
    setListingShares(true)
    try {
      const shares = await listSmbShares(currentConfig)
      if (!shares.length) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        showSheet(t('sync.noSharesFound'), [
          { label: t('dialog.cancel') }
        ])
        return
      }
      Haptics.selectionAsync()
      showSheet(
        t('sync.pickShareTitle'),
        shares.map((name) => ({
          label: name,
          onSelect: () => {
            Haptics.selectionAsync()
            setShare(name)
          },
        }))
      )
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      showSheet(t('sync.failedListShares'), [
        { label: err instanceof Error ? err.message : String(err) },
        { label: t('dialog.cancel') },
      ])
    } finally {
      setListingShares(false)
    }
  }

  const onTest = async () => {
    if (!host.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testSmbConnection(currentConfig)
      setTestResult(res)
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <FormScreenHeader title={t('sync.smbSettingsTitle')} />
      <KeyboardAwareScrollView contentContainerStyle={padding} bottomOffset={32}>
        {/* Local Network Discovery Carousel */}
        {discovered.length > 0 && (
          <View style={styles.discoverySection}>
            <View style={styles.discoveryHeader}>
              <Text style={styles.discoveryTitle}>{t('sync.discoveredTitle')}</Text>
              {scanning && <ActivityIndicator size="small" color={colors.accent} />}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.discoveryScroll}>
              {discovered.map((srv) => {
                const active = host === srv.host
                return (
                  <Pressable
                    key={srv.host}
                    onPress={() => pickDiscovered(srv.host)}
                    style={[styles.discoveryCard, active && styles.discoveryCardActive]}
                  >
                    <SFIcon
                      name="server.rack"
                      fallback="desktop-outline"
                      size={20}
                      color={active ? colors.accent : colors.textMuted}
                    />
                    <Text style={[styles.discoveryHost, active && styles.discoveryHostActive]} numberOfLines={1}>
                      {srv.host}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        )}

        {/* Server Host / Port */}
        <ListSection header={t('sync.sectionServer')}>
          <InputCell
            label={t('sync.serverHost')}
            value={host}
            onChangeText={setHost}
            placeholder={t('sync.serverHostPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <InputCell
            label={t('sync.serverPort')}
            value={port}
            onChangeText={setPort}
            placeholder="445"
            keyboardType="number-pad"
          />
          <InputCell
            label={t('sync.serverDomain')}
            value={domain}
            onChangeText={setDomain}
            placeholder="WORKGROUP"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </ListSection>

        {/* Authentication */}
        <ListSection header={t('sync.sectionAuth')}>
          <SegmentCell<AuthMode>
            label={t('sync.authType')}
            value={authMode}
            onChange={(mode) => {
              Haptics.selectionAsync()
              setAuthMode(mode)
            }}
            options={[
              { value: 'user', label: t('sync.authUser') },
              { value: 'guest', label: t('sync.authGuest') },
            ]}
          />
          {authMode === 'user' && (
            <>
              <InputCell
                label={t('sync.username')}
                value={username}
                onChangeText={setUsername}
                placeholder={t('sync.usernamePlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <InputCell
                label={t('sync.password')}
                value={password}
                onChangeText={setPassword}
                placeholder={t('sync.passwordPlaceholder')}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}
        </ListSection>

        {/* Share and Path */}
        <ListSection header={t('sync.sectionStorage')} footer={t('sync.storageFooter')}>
          <InputCell
            label={t('sync.shareName')}
            value={share}
            onChangeText={setShare}
            placeholder={t('sync.sharePlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ButtonCell
            label={t('sync.pickShareButton')}
            onPress={onPickShare}
            loading={listingShares}
            disabled={!host.trim()}
            icon={{ symbol: 'list.bullet', fallback: 'list' }}
          />
          <InputCell
            label={t('sync.subfolderPath')}
            value={path}
            onChangeText={setPath}
            placeholder="Reverie Sync"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ButtonCell
            label={t('sync.browseFoldersButton')}
            onPress={() => setBrowserVisible(true)}
            disabled={!host.trim() || !share.trim()}
            icon={{ symbol: 'folder', fallback: 'folder-outline' }}
          />
        </ListSection>

        {/* Connection Test */}
        <ListSection header={t('sync.sectionTest')}>
          <ButtonCell
            label={t('sync.testConnectionButton')}
            onPress={onTest}
            loading={testing}
            disabled={!host.trim()}
            icon={{ symbol: 'antenna.radiowaves.left.and.right', fallback: 'wifi' }}
          />
          {testResult && (
            <View style={[styles.statusCard, testResult.ok ? styles.statusCardSuccess : styles.statusCardError]}>
              <SFIcon
                name={testResult.ok ? 'checkmark.circle.fill' : 'exclamationmark.triangle.fill'}
                fallback={testResult.ok ? 'checkmark-circle' : 'alert-circle'}
                size={20}
                color={testResult.ok ? colors.success : colors.danger}
              />
              <Text style={[styles.statusText, testResult.ok ? styles.statusTextSuccess : styles.statusTextError]}>
                {testResult.ok
                  ? `${t('sync.testSuccess')} (${testResult.protocol ?? 'SMB'})`
                  : testResult.error ?? t('sync.testFailed')}
              </Text>
            </View>
          )}
        </ListSection>

        {/* Network and Security */}
        <ListSection header={t('sync.sectionNetwork')} footer={t('sync.wifiOnlyFooter')}>
          <SwitchCell
            label={t('sync.wifiOnly')}
            value={wifiOnly}
            onValueChange={setWifiOnly}
          />
        </ListSection>
      </KeyboardAwareScrollView>

      {/* Modal Folder Browser */}
      {browserVisible && (
        <SmbFolderBrowser
          visible={browserVisible}
          config={currentConfig}
          initialPath={path}
          onSelectPath={(chosen) => setPath(chosen)}
          onClose={() => setBrowserVisible(false)}
        />
      )}
    </>
  )
}

const createStyles = (colors: Colors) =>
  StyleSheet.create({
    discoverySection: {
      marginBottom: 20,
    },
    discoveryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    discoveryTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    discoveryScroll: {
      paddingHorizontal: 16,
      gap: 10,
    },
    discoveryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    discoveryCardActive: {
      borderColor: colors.accent,
      backgroundColor: colors.surfaceRaised,
    },
    discoveryHost: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    discoveryHostActive: {
      color: colors.accent,
    },
    statusCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 12,
    },
    statusCardSuccess: {
      backgroundColor: 'rgba(95, 203, 139, 0.12)',
    },
    statusCardError: {
      backgroundColor: 'rgba(240, 97, 109, 0.12)',
    },
    statusText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
    },
    statusTextSuccess: {
      color: colors.success,
    },
    statusTextError: {
      color: colors.danger,
    },
  })
