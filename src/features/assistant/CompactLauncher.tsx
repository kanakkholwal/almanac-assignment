import { motion } from "framer-motion";
import {
  Camera,
  Maximize2,
  MessageSquareText,
  Mic,
  MicOff,
  MonitorPlay,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

interface CompactLauncherProps {
  onOpenChat: () => void;
  onCapture: () => void;
  onVoice: () => void;
  onScreenShare: () => void;
  onNotes: () => void;
  voiceEnabled?: boolean;
  modKey?: string;
}

interface ToolAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}

export function CompactLauncher({
  onOpenChat,
  onCapture,
  onVoice,
  onScreenShare,
  onNotes,
  voiceEnabled = false,
  modKey = "⌥",
}: CompactLauncherProps) {
  const tools: ToolAction[] = [
    {
      label: voiceEnabled ? "Talk to Alma" : "Voice unavailable",
      icon: voiceEnabled ? Mic : MicOff,
      onClick: onVoice,
      disabled: !voiceEnabled,
    },
    { label: "Meeting notes", icon: NotebookPen, onClick: onNotes },
    { label: "Live screen share", icon: MonitorPlay, onClick: onScreenShare },
    { label: "Expand chat", icon: Maximize2, onClick: onOpenChat },
  ];

  return (
    <motion.div
      data-drag-region="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      className="flex h-full w-full flex-col justify-between gap-3 p-4"
    >
      <div className="flex flex-col gap-2.5">
        <ShortcutRow
          icon={MessageSquareText}
          label="Ask Alma"
          keys={[modKey, "↵"]}
          onClick={onOpenChat}
        />
        <ShortcutRow
          icon={Camera}
          label="Capture"
          keys={[modKey, "S"]}
          onClick={onCapture}
        />
      </div>

      <div className="flex items-center justify-around gap-2" data-no-drag="true">
        {tools.map(({ label, icon: Icon, onClick, disabled }) => (
          <Button
            key={label}
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            size="icon"
            variant="outline"
          >
            <Icon />
          </Button>
        ))}
      </div>
    </motion.div>
  );
}

function ShortcutRow({
  icon: Icon,
  label,
  keys,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  keys: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-no-drag="true"
      onClick={onClick}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left",
        "transition-colors hover:bg-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
        <span className="font-sans text-[14px] text-foreground">{label}</span>
      </span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </button>
  );
}
