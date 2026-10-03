import { File } from 'expo-file-system'

type CloudFolderModule = {
  pickFolder(): Promise<string | null>
  folderName(): string | null
  forgetFolder(): void
  list(path: string): Promise<string[]>
  copyIn(path: string, localUri: string): Promise<void>
  copyOut(localUri: string, path: string): Promise<void>
  remove(path: string): Promise<void>
}

type Bridge = {
  pick(): Promise<string | null>
  name(): string | null
  forget(): void
  list(path: string): Promise<string[]>
  read(path: string): Promise<Uint8Array>
  write(path: string, bytes: Uint8Array): Promise<void>
  remove(path: string): Promise<void>
}

// The desktop build reaches the real folder through the Electron bridge (electron/preload.js);
// in a plain browser there is none, and sync is not offered.
const bridge = typeof window === 'undefined' ? undefined : (window as unknown as { reverieDesktop?: { cloudFolder: Bridge } }).reverieDesktop?.cloudFolder

export const cloudFolder: CloudFolderModule | null = bridge
  ? {
      pickFolder: () => bridge.pick(),
      folderName: () => bridge.name(),
      forgetFolder: () => bridge.forget(),
      list: (path) => bridge.list(path),
      copyIn: async (path, localUri) => new File(localUri).write(new Uint8Array(await bridge.read(path))),
      copyOut: async (localUri, path) => bridge.write(path, await new File(localUri).bytes()),
      remove: (path) => bridge.remove(path),
    }
  : null
