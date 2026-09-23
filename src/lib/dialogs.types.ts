// Shared by the native dialogs and their web stand-ins.
export type SheetAction = {
  label: string
  destructive?: boolean
  onSelect: () => void
}

export type Confirmation = {
  title: string
  message?: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
}

export type TextPrompt = {
  title: string
  message?: string
  initial?: string
  confirmLabel: string
  onSubmit: (text: string) => void
}
