import { motion } from "framer-motion";
import type { ComponentProps } from "react";

import { AlmaAvatar } from "@/components/AlmaAvatar";

import { CompactLauncher } from "./CompactLauncher";

const ORB_SIZE = 56;

// A snappy spring so the box visibly *morphs* between the orb circle and the
// compact card rather than cross-fading two separate windows.
const MORPH = { type: "spring" as const, stiffness: 400, damping: 34, mass: 0.9 };

interface LauncherProps {
  /** false → idle orb, true → compact launcher. */
  expanded: boolean;
  onExpand: () => void;
  compact: ComponentProps<typeof CompactLauncher>;
}

/**
 * The idle launcher surface. Orb and compact launcher are a single morphing
 * card living in one fixed-size window — no OS resize, no window swap. Clicking
 * the orb springs the card open into the compact view; clicking outside the
 * window collapses it back (the parent watches for the window losing focus).
 */
export function Launcher({ expanded, onExpand, compact }: LauncherProps) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <motion.div
        data-drag-region="true"
        role={expanded ? undefined : "button"}
        tabIndex={expanded ? -1 : 0}
        aria-label={expanded ? undefined : "Open Alma launcher"}
        onClick={() => {
          if (!expanded) onExpand();
        }}
        onKeyDown={(e) => {
          if (!expanded && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onExpand();
          }
        }}
        initial={false}
        animate={{
          width: expanded ? "100%" : ORB_SIZE,
          height: expanded ? "100%" : ORB_SIZE,
          borderRadius: expanded ? 16 : ORB_SIZE,
        }}
        transition={MORPH}
        className="launcher-surface relative overflow-hidden"
      >
        {/* Orb face — the Alma mark inside a slowly rotating accent ring. */}
        <motion.div
          aria-hidden={expanded}
          initial={false}
          animate={{ opacity: expanded ? 0 : 1, scale: expanded ? 0.6 : 1 }}
          transition={{ duration: expanded ? 0.12 : 0.2 }}
          style={{ pointerEvents: expanded ? "none" : "auto" }}
          className="absolute inset-0 grid place-items-center"
        >
          <div
            className="relative grid place-items-center"
            style={{ width: ORB_SIZE, height: ORB_SIZE }}
          >
            <span className="alma-orb-ring" aria-hidden />
            <AlmaAvatar size={28} glow={false} />
          </div>
        </motion.div>

        {/* Compact face — fades in once the card has room to hold it. */}
        <motion.div
          aria-hidden={!expanded}
          initial={false}
          animate={{ opacity: expanded ? 1 : 0 }}
          transition={{ duration: 0.16, delay: expanded ? 0.08 : 0 }}
          style={{ pointerEvents: expanded ? "auto" : "none" }}
          className="absolute inset-0"
        >
          <CompactLauncher {...compact} />
        </motion.div>
      </motion.div>
    </div>
  );
}
