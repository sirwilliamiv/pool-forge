// The mark: a pool in section, which is the one drawing every person in this
// trade reads the same way. Black shell, one blue waterline.
//
// Colour is a guest everywhere else in the system; the mark and the
// illustrations are the two places it is allowed in.

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <rect x="0.5" y="0.5" width="21" height="21" rx="6" fill="#000" />
      {/* The shell, deep end on the right. */}
      <path
        d="M5 7.5 L5 12.5 Q5 15 7.5 15 L14.5 15 Q17 15 17 12 L17 7.5"
        stroke="#fff"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
      {/* Waterline. */}
      <path
        d="M4.5 9 Q6.5 7.9 8.5 9 T12.5 9 T16.5 9"
        stroke="#00B6FF"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
