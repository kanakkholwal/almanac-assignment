import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronUp, X } from "lucide-react";

import { AlmaAvatar } from "@/components/AlmaAvatar";
import { cn } from "@/lib/utils";

interface PromptPayload {
  title: string;
  description: string;
  actionLabel: string;
}

interface MeetingPromptProps {
  prompt: PromptPayload | null;
  onStart: () => void;
  onDismiss: () => void;
}

export function MeetingPrompt({ prompt, onStart, onDismiss }: MeetingPromptProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <AnimatePresence>
      {prompt ? (
        <motion.div
          role="dialog"
          aria-label={prompt.title}
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="absolute left-1/2 top-4 z-20 -translate-x-1/2"
        >
          <button
            aria-label="Dismiss notification"
            onClick={() => {
              setMenuOpen(false);
              onDismiss();
            }}
            className={cn(
              "absolute -left-2.5 -top-2.5 z-10 flex size-6 items-center justify-center rounded-pill border border-border",
              "bg-canvas-card text-foreground/70",
              "transition-colors hover:bg-canvas-soft hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            <X className="size-3" />
          </button>

          <div
            className={cn(
              "surface-card relative w-130 max-w-[calc(100vw-32px)] overflow-hidden rounded-sm",
            )}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <AlmaAvatar size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-sans text-[14px] tracking-tight text-foreground">
                  {prompt.title}
                </div>
                <p className="mt-0.5 font-sans text-[12.5px] leading-snug text-muted-foreground">
                  {prompt.description}
                </p>
              </div>

              <div className="flex items-stretch overflow-hidden rounded-pill border border-border">
                <button
                  onClick={onStart}
                  className={cn(
                    "px-4 font-sans text-[13px] text-foreground transition-colors",
                    "hover:bg-white/4",
                    "focus-visible:outline-none focus-visible:bg-white/4",
                  )}
                >
                  {prompt.actionLabel}
                </button>
                <div className="w-px self-stretch bg-border" />
                <button
                  aria-label="More options"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((v) => !v)}
                  className={cn(
                    "flex w-8 items-center justify-center text-foreground/70 transition-colors",
                    "hover:bg-white/4 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:bg-white/4",
                  )}
                >
                  <ChevronUp
                    className={cn("size-3.5 transition-transform", !menuOpen && "rotate-180")}
                  />
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={{ duration: 0.14 }}
                className={cn(
                  "surface-card absolute right-3 top-[calc(100%+6px)] w-45 overflow-hidden rounded-sm",
                )}
                role="menu"
              >
                <MenuItem
                  label="Open Alma"
                  onClick={() => {
                    setMenuOpen(false);
                    onDismiss();
                  }}
                />
                <div className="h-px bg-hairline" />
                <MenuItem
                  label="Turn off notifications"
                  onClick={() => {
                    setMenuOpen(false);
                    onDismiss();
                  }}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "block w-full px-4 py-2.5 text-left font-sans text-[13px] text-foreground transition-colors",
        "hover:bg-white/4",
        "focus-visible:outline-none focus-visible:bg-white/4",
      )}
    >
      {label}
    </button>
  );
}
