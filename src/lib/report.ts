import { showMessage } from '@/lib/dialogs'
import { errorMessage } from '@/lib/errors'
import { showToast } from '@/lib/toast'

// A failure told to the user: as a toast when it came from something done in the
// background, as a dialog when it came from a button they are looking at.
export function reportError(title: string, err: unknown) {
  showToast({ tone: 'error', title, message: errorMessage(err) })
}

export function alertError(title: string, err: unknown) {
  showMessage(title, errorMessage(err))
}
