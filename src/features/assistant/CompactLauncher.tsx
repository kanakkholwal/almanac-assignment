import { motion } from "framer-motion";
import {
  Headphones,
  Maximize2,
  MessageSquareText,
  MonitorUp,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

interface CompactLauncherProps {
  onOpenChat: () => void;
  onCapture: () => void;
  modKey?: string;
}

interface ToolAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

export function CompactLauncher({
  onOpenChat,
  onCapture,
  modKey = "⌥",
}: CompactLauncherProps) {
  const tools: ToolAction[] = [
    { label: "Voice output", icon: Headphones, onClick: onCapture },
    { label: "Capture screen", icon: MonitorUp, onClick: onCapture },
    { label: "Expand", icon: Maximize2, onClick: onOpenChat },
  ];

  return (
    <motion.div
      layoutId="alma-shell"
      data-drag-region="true"
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="surface-card flex h-full w-full flex-col justify-between gap-3 rounded-sm p-4"
    >
      <div className="flex flex-col gap-2.5">
        <ShortcutRow
          icon={MessageSquareText}
          label="Ask Alma"
          keys={[modKey, "↵"]}
          onClick={onOpenChat}
        />
        <ShortcutRow
          icon={MonitorUp}
          label="Capture"
          keys={[modKey, "S"]}
          onClick={onCapture}
        />
      </div>

      <div className="flex items-center justify-around gap-2" data-no-drag="true">
        {tools.map(({ label, icon: Icon, onClick }) => (
          <Button
            key={label}
            aria-label={label}
            onClick={onClick}
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
        "group flex items-center justify-between gap-3 rounded-sm px-1 py-1 text-left",
        "transition-colors hover:bg-white/3",
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
