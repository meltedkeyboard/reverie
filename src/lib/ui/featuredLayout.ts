// A home tab with a single item draws it as one card over the whole screen: a full-width
// square picture (`aspectRatio: 1`, so never stretched or cut) with the text under it
// filling the rest, and the list does not scroll.
export const FEATURED_MAX = 1
export const FEATURED_GAP = 16

// The least room the text under the picture needs; on a screen too short for the square
// plus this, the card stops filling the screen and the list scrolls again.
const MIN_BODY = 120

export function isFeatured(count: number) {
  return count > 0 && count <= FEATURED_MAX
}

// How tall the lone card is and whether the list still has to scroll. `box` is the
// measured screen, `chrome` what the list pads or reserves around the card.
export function featuredFill(box: { width: number; height: number }, chrome: number, sidePadding: number) {
  const room = box.height - chrome
  const least = box.width - sidePadding * 2 + MIN_BODY
  return { height: Math.max(room, least), scroll: room < least }
}
