import { motion } from "framer-motion";
import { Headphones, Maximize2, MonitorUp, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CompactLauncherProps {
  onOpenChat: () => void;
  onCapture: () => void;
  modKey?: string;
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-md border border-white/15 bg-white/10 px-1.5 text-[10.5px] font-medium text-surface-ink/85">
      {label}
    </span>
  );
}

export function CompactLauncher({ onOpenChat, onCapture, modKey = "⌥" }: CompactLauncherProps) {
  return (
    <motion.div
      layoutId="alma-shell"
      className="glass-panel flex h-full w-full flex-col justify-between gap-2 rounded-[1.4rem] px-3 py-3"
      initial={{ opacity: 0.94, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      data-drag-region="true"
    >
      <button
        className="flex w-full items-center justify-between gap-2 rounded-xl px-1 text-left transition hover:bg-white/5"
        data-no-drag="true"
        onClick={onOpenChat}
      >
        <span className="text-[13px] font-medium text-surface-ink">Ask Alma</span>
        <span className="flex items-center gap-1">
          <Chip label={modKey} />
          <Chip label="—" />
        </span>
      </button>

      <button
        className="flex w-full items-center justify-between gap-2 rounded-xl px-1 text-left transition hover:bg-white/5"
        data-no-drag="true"
        onClick={onCapture}
      >
        <span className="text-[13px] font-medium text-surface-ink">Capture</span>
        <span className="flex items-center gap-1">
          <Chip label={modKey} />
          <Chip label="S" />
        </span>
      </button>

      <div className="flex items-center justify-between gap-1 pt-1" data-no-drag="true">
        <Button aria-label="Voice output" onClick={onCapture} size="icon" variant="glass">
          <Headphones size={13} />
        </Button>
        <Button aria-label="Capture screen" onClick={onCapture} size="icon" variant="glass">
          <MonitorUp size={13} />
        </Button>
        <Button aria-label="Settings" onClick={onOpenChat} size="icon" variant="glass">
          <Settings size={13} />
        </Button>
        <Button aria-label="Expand" onClick={onOpenChat} size="icon" variant="glass">
          <Maximize2 size={13} />
        </Button>
      </div>
    </motion.div>
  );
}
