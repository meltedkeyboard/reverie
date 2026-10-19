# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Reverie is a roleplay chat client (Expo 57, React Native 0.86 New Architecture, expo-router, expo-sqlite, TypeScript strict) for iOS, Android and a desktop build (react-native-web in Electron). It talks to a local OpenAI-compatible model server; all data stays on the device. `@/*` maps to `src/`.

**Read [CODEBASE.md](CODEBASE.md) first.** It is the detailed map: a "Find it fast" table (what to change → which file), the screens, the data flow of a chat, rooms, the database, folder sync, Liquid Glass, Android differences and the conventions. Keep it up to date in the same change when you move or add something it describes.

## Commands

- `npm install` (its `postinstall` applies `tools/patches` with patch-package and renders the icons).
- `npx expo start`: Metro for a dev build or Expo Go. `npx expo start --web`: the web build.
- `npm run desktop`: Metro on 8081 plus the Electron window (`tools/desktop-dev.mjs`). `npm run desktop:build`: an installer into `release/`.
- `npm run typecheck` (`tsc --noEmit`): the only automated check. There are no tests, and no ESLint or Prettier config: do not run a formatter over files, since the code is hand-formatted.
- `npx expo export --platform ios --output-dir <tmp>` bundles the app without a device, a quick way to catch a broken import.
- Native builds run on GitHub Actions: `.github/workflows/ios.yml` (unsigned `.ipa`), `android.yml` (`.apk`), `desktop.yml`; a `v*` tag attaches them to a release. Locally on a Mac: `./tools/build-ipa.sh`.

## Working in this repo

- The owner develops on Windows with no Mac and tests on an iPhone through the GitHub iOS build. Anything native (gestures, animation smoothness, Liquid Glass, haptics) cannot be verified locally; say so plainly and, where it helps, add a `__DEV__` log the owner can read from Metro, removing it before the work is committed.
- Commit (`git add -A`) and push only when asked. Commit messages are one plain sentence describing what the user sees, in the style of `git log`.
- On Windows Metro sometimes misses a change made outside the editor; restart it with `--clear` if the bundle looks stale. The web build keeps its SQLite database in OPFS per origin, and a second tab on the same origin fails with `NoModificationAllowedError`.
- Comments explain why, in full sentences, in the voice of the surrounding code; match that density.
- Strings go through `t('key')` with the key in both `src/locales/en.json` and `ru.json`.

## Architecture in brief

- `src/app/`: expo-router screens. `chat/[id].tsx` is the largest: a character's chats (`CharacterChats`) or a room's scene (`RoomView`).
- `src/db/`: the schema, migrations and queries; screens never touch SQL directly. `src/lib/`: logic without UI (`lib/chat` prompts, streaming, rooms in `lib/chat/room`). `src/hooks/`: `useChat`, `useConversation`, `useRoom` and smaller ones. `src/api/llm.ts`: requests and SSE.
- Platform differences sit next to the code: `*.web.ts(x)` files or `Platform.OS` branches; iOS-only native UI (`@expo/ui` SwiftUI, `expo-glass-effect`) is loaded through `src/lib/ui/nativeUI.ts` (`swiftUI`, `liquidGlass` are null where absent) and every component has a plain fallback. Local Expo modules are in `modules/`.
- A character's chat screen keeps two recycled `ChatThread`s (FlashList) and swaps them on the UI thread when a chat is picked in `ChatDrawer`; the chat's logic lives in a view-less `ChatController`, and the header and composer are made once. Message rows come up plain and are upgraded to the selectable UITextView and SwiftUI menus a row a frame while nothing moves (`src/components/chat/thread/hydration.ts`). Rooms still use `RoomView` with `ConversationList` and the `/rooms/:roomId` scenes screen.
- Liquid Glass does not render under a parent with opacity: hide or swap glass-bearing views by transform, never by fading them.
