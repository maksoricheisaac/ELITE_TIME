"use client"

import { MotionConfig } from "framer-motion"

/** Les animations Motion/Framer respectent prefers-reduced-motion : transformations désactivées, fondus conservés. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
