import { motion } from "framer-motion";
import { Square } from "lucide-react";

import { AlmaAvatar } from "@/components/AlmaAvatar";
import { cn } from "@/lib/utils";

interface NotesPillProps {
  recording?: boolean;
  onStop?: () => void;
  onOpenChat?: () => void;
}

export function NotesPill({ recording = false, onStop, onOpenChat }: NotesPillProps) {
  return (
    <motion.div
      data-drag-region="true"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={cn(
        "relative flex w-full flex-col items-center overflow-hidden rounded-full border border-border",
        "bg-card shadow-elevated",
      )}
      style={{
        backgroundImage:
          "radial-gradient(80% 60% at 50% 100%, oklch(0.55 0.18 280 / 0.28), transparent 70%)",
      }}
    >
      <button
        type="button"
        data-no-drag="true"
        onClick={onOpenChat}
        aria-label="Open Alma"
        className={cn(
          "mt-3 transition-transform",
          "hover:scale-[1.04] focus-visible:outline-none focus-visible:scale-[1.04]",
        )}
      >
        <AlmaAvatar size={56} />
      </button>

      <AudioDots active className="mt-3" />

      {recording ? (
        <>
          <div className="mt-3 h-px w-full bg-border" />
          <button
            type="button"
            data-no-drag="true"
            onClick={onStop}
            aria-label="Stop recording"
            className={cn(
              "my-3 flex size-10 items-center justify-center rounded-lg",
              "bg-white text-foreground/90 shadow-sm",
              "transition-transform hover:scale-[1.04] active:scale-[0.97]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Square className="size-3.5 fill-current" />
          </button>
        </>
      ) : (
        <div className="h-3" />
      )}
    </motion.div>
  );
}

function AudioDots({ active = false, className }: { active?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full bg-success",
            active && "animate-pulse",
          )}
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}
