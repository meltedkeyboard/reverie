// A file opened from Files or shared to the app comes in as its file URL, which would
// otherwise be read as a route; the characters list imports it instead.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (path.startsWith('file://')) return `/?file=${encodeURIComponent(path)}`
  return path
}
