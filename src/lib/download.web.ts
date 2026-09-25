export async function saveJson(fileName: string, contents: string): Promise<{ name: string; folder: string } | null> {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // The blob has to outlive the click, otherwise the download never starts.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  // The browser decides where the file goes, so there's nothing to report.
  return null
}

export async function saveImage(uri: string) {
  const link = document.createElement('a')
  link.href = uri
  link.download = `image-${Date.now()}.jpg`
  document.body.appendChild(link)
  link.click()
  link.remove()
}
