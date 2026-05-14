import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MeetingNotification } from "@/lib/mockMeetingAdapter";

interface MeetingPromptProps {
  prompt: MeetingNotification | null;
  onStart: () => void;
  onDismiss: () => void;
}

export function MeetingPrompt({ prompt, onStart, onDismiss }: MeetingPromptProps) {
  return (
    <AnimatePresence>
      {prompt ? (
        <motion.div
          role="dialog"
          aria-label={prompt.title}
          initial={{ opacity: 0, y: -16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="glass-panel absolute right-4 top-4 z-20 w-[280px] overflow-hidden rounded-xl"
        >
          <div className="flex items-start gap-3 p-3.5">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent ring-1 ring-inset ring-accent/25"
            >
              <Sparkles className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold leading-snug tracking-tight text-foreground">
                {prompt.title}
              </div>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                {prompt.description}
              </p>
            </div>
            <button
              aria-label="Dismiss prompt"
              onClick={onDismiss}
              className="-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-border bg-black/15 px-3.5 py-2">
            <Button onClick={onDismiss} size="sm" variant="ghost">
              Not now
            </Button>
            <Button onClick={onStart} size="sm" variant="default">
              {prompt.actionLabel}
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
