import { Image } from 'expo-image'
import { useRef } from 'react'
import { Modal, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { IconButton } from './IconButton'

type Props = { uri: string | null; onClose: () => void }

export function ImageViewer({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets()
  // Keeps the picture on screen while the modal fades out after uri turns null.
  const shown = useRef<string | null>(null)
  if (uri) shown.current = uri

  return (
    <Modal visible={uri !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.root} onPress={onClose}>
        {shown.current ? (
          <Image source={{ uri: shown.current }} style={StyleSheet.absoluteFill} contentFit="contain" />
        ) : null}
      </Pressable>
      <IconButton name="close" size={24} color="#FFFFFF" onPress={onClose} style={[styles.close, { top: insets.top + 8 }]} />
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  close: { position: 'absolute', right: 12, backgroundColor: 'rgba(255, 255, 255, 0.14)' },
})
