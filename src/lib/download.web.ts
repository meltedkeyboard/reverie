export async function saveJson(fileName: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // The blob has to outlive the click, otherwise the download never starts.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
