import {
  Maximize2,
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
    // Everything is a single centred stack — the shortcut rows and the action
    // cluster sit close together rather than pinned to opposite edges.
    <div
      data-drag-region="true"
      className="flex h-full w-full flex-col items-center justify-center gap-2.5 p-2"
    >
      <div className="flex flex-col items-center gap-1">
        <ShortcutRow label="Ask Alma" keys={[modKey, "↵"]} onClick={onOpenChat} />
        <ShortcutRow label="Capture" keys={[modKey, "S"]} onClick={onCapture} />
      </div>

      <div className="flex items-center justify-center gap-2" data-no-drag="true">
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
    </div>
  );
}

function ShortcutRow({
  label,
  keys,
  onClick,
}: {
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
        "flex items-center justify-center gap-2.5 rounded-md px-3 py-1.5",
        "transition-colors hover:bg-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="font-sans text-[14px] text-foreground">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </button>
  );
}
