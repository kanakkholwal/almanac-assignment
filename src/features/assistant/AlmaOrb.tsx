import { motion } from "framer-motion";

import { AlmaAvatar } from "@/components/AlmaAvatar";

interface AlmaOrbProps {
  /** Fired on hover / click / focus — morphs the orb into the compact launcher. */
  onActivate: () => void;
}

/**
 * The idle launcher surface: a small circular widget showing the Alma mark,
 * lifted by a drop shadow and wrapped in a slowly rotating accent ring. The
 * mark itself stays still — only the ring sweeps. Hovering hands off to the
 * compact launcher.
 */
export function AlmaOrb({ onActivate }: AlmaOrbProps) {
  return (
    <motion.div
      key="orb"
      data-drag-region="true"
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
      className="flex h-full w-full items-center justify-center"
      onMouseEnter={onActivate}
    >
      <div
        data-no-drag="true"
        role="button"
        tabIndex={0}
        aria-label="Open Alma launcher"
        className="alma-orb"
        onClick={onActivate}
        onFocus={onActivate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onActivate();
          }
        }}
      >
        <span className="alma-orb-ring" aria-hidden />
        <span className="alma-orb-core">
          <AlmaAvatar size={34} glow={false} />
        </span>
      </div>
    </motion.div>
  );
}
