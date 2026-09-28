import type { SQLiteDatabase } from 'expo-sqlite'

// The browser has no Files app, so there is nothing to hide.
export function databaseDirectory(): string | undefined {
  return undefined
}

export function isShownInFiles() {
  return false
}

export async function moveStorage(_db: SQLiteDatabase, _shown: boolean) {
  return () => {}
}

export async function keepCopy(_db: SQLiteDatabase) {}

export function discardInactiveDatabase() {}
