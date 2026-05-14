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
      className="surface-card relative flex w-full flex-col items-center overflow-hidden rounded-pill"
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

      <AudioDots className="mt-3" />

      {recording ? (
        <>
          <div className="mt-3 h-px w-full bg-hairline" />
          <button
            type="button"
            data-no-drag="true"
            onClick={onStop}
            aria-label="Stop recording"
            className={cn(
              "my-3 flex size-10 items-center justify-center rounded-sm",
              "bg-primary text-primary-foreground",
              "transition-colors hover:bg-white/90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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

function AudioDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-pill bg-foreground/85"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}
