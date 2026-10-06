// The chat list is inverted (scaleY -1), and on Android the area Pressable measures for a
// touch comes out mirrored. Any MOVE event of a real finger (or a press held a few tens of
// milliseconds) then counts as leaving the button and cancels onPress, while an instant
// tap, which has no MOVE, still works. A huge retention offset makes the check pass anywhere.
export const PRESS_ANYWHERE = { top: 4000, left: 4000, right: 4000, bottom: 4000 }
