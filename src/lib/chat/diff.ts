export type DiffType = 'same' | 'added' | 'removed'

export type DiffPart = {
  type: DiffType
  value: string
}

// Tokenizes text into words, whitespace and punctuation so that
// joining all tokens reproduces the original text identically.
function tokenize(text: string): string[] {
  return text.split(/(\s+|[^\s\p{L}\p{N}]+)/u).filter(Boolean)
}

// Computes a word-level diff between before and after strings using
// Longest Common Subsequence (LCS) with common prefix and suffix trimming.
export function computeDiff(before: string, after: string): DiffPart[] {
  if (before === after) {
    return before ? [{ type: 'same', value: before }] : []
  }
  if (!before) {
    return after ? [{ type: 'added', value: after }] : []
  }
  if (!after) {
    return before ? [{ type: 'removed', value: before }] : []
  }

  const a = tokenize(before)
  const b = tokenize(after)

  // 1. Trim common prefix
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++
  }

  // 2. Trim common suffix
  let aEnd = a.length - 1
  let bEnd = b.length - 1
  while (aEnd >= start && bEnd >= start && a[aEnd] === b[bEnd]) {
    aEnd--
    bEnd--
  }

  const aMid = a.slice(start, aEnd + 1)
  const bMid = b.slice(start, bEnd + 1)
  const midDiff: DiffPart[] = []

  if (aMid.length === 0) {
    if (bMid.length > 0) midDiff.push({ type: 'added', value: bMid.join('') })
  } else if (bMid.length === 0) {
    if (aMid.length > 0) midDiff.push({ type: 'removed', value: aMid.join('') })
  } else if (aMid.length * bMid.length > 1_500_000) {
    // If the changed middle section is unusually massive (> 1.5M pairs),
    // fallback to block replacement to prevent any UI freeze.
    midDiff.push({ type: 'removed', value: aMid.join('') })
    midDiff.push({ type: 'added', value: bMid.join('') })
  } else {
    const n = aMid.length
    const m = bMid.length
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (aMid[i - 1] === bMid[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
        }
      }
    }

    let i = n
    let j = m
    const revParts: DiffPart[] = []
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && aMid[i - 1] === bMid[j - 1]) {
        revParts.push({ type: 'same', value: aMid[i - 1] })
        i--
        j--
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        revParts.push({ type: 'added', value: bMid[j - 1] })
        j--
      } else if (i > 0) {
        revParts.push({ type: 'removed', value: aMid[i - 1] })
        i--
      }
    }

    revParts.reverse()
    for (const part of revParts) {
      if (midDiff.length > 0 && midDiff[midDiff.length - 1].type === part.type) {
        midDiff[midDiff.length - 1].value += part.value
      } else {
        midDiff.push({ ...part })
      }
    }
  }

  const result: DiffPart[] = []
  if (start > 0) {
    result.push({ type: 'same', value: a.slice(0, start).join('') })
  }
  for (const part of midDiff) {
    if (result.length > 0 && result[result.length - 1].type === part.type) {
      result[result.length - 1].value += part.value
    } else {
      result.push(part)
    }
  }
  if (aEnd + 1 < a.length) {
    const suffix = a.slice(aEnd + 1).join('')
    if (result.length > 0 && result[result.length - 1].type === 'same') {
      result[result.length - 1].value += suffix
    } else {
      result.push({ type: 'same', value: suffix })
    }
  }

  return result
}
