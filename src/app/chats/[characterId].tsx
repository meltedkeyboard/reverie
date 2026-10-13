import { Redirect, useLocalSearchParams } from 'expo-router'

export default function CharacterChatsScreen() {
  const { characterId } = useLocalSearchParams<{ characterId: string }>()
  return <Redirect href={`/chat/new?character=${characterId}`} />
}
