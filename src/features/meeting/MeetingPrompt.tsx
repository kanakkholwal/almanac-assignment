import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="message-surface absolute right-5 top-4 z-20 w-[258px] overflow-hidden rounded-2xl"
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          initial={{ opacity: 0, y: -18, scale: 0.96 }}
        >
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="mt-0.5 rounded-full bg-surface-accent/20 p-2 text-surface-accent">
              <Sparkles size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-surface-ink">{prompt.title}</div>
              <div className="mt-1 text-xs leading-5 text-surface-muted">
                {prompt.description}
              </div>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between px-3 py-2">
            <Button onClick={onStart} size="sm" variant="accent">
              {prompt.actionLabel}
            </Button>
            <Button
              aria-label="Dismiss prompt"
              className="rounded-full"
              onClick={onDismiss}
              size="icon"
              variant="ghost"
            >
              <ChevronDown size={16} />
            </Button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
