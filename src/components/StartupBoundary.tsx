import { Component, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { t } from '@/i18n'
import { colors, fonts } from '@/theme'

type Props = { children: ReactNode }
type State = { error: Error | null }

// The database opens before anything can render, and DatabaseProvider reports a
// failure by throwing. Without this the screen would just stay empty, with the
// reason visible only in the console.
export class StartupBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <View style={styles.screen}>
        <Text style={styles.title}>{t('startup.dbFailedTitle')}</Text>
        <Text style={styles.text}>{error.message}</Text>
      </View>
    )
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
    backgroundColor: colors.bg,
  },
  title: { color: colors.text, fontFamily: fonts.prose, fontSize: 21, textAlign: 'center' },
  text: { color: colors.textMuted, fontSize: 15, lineHeight: 21, textAlign: 'center' },
})
