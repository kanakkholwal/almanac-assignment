import { motion } from "framer-motion";
import {
  Headphones,
  Maximize2,
  MessageSquareText,
  MonitorUp,
  Settings,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

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
    { label: "Settings", icon: Settings, onClick: () => {} },
    { label: "Expand", icon: Maximize2, onClick: onOpenChat },
  ];

  return (
    <motion.div
      layoutId="alma-shell"
      data-drag-region="true"
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="glass-panel flex h-full w-full flex-col gap-1 rounded-2xl p-1.5"
    >
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

      <div className="mt-auto flex items-center justify-between gap-1 border-t border-border pt-1">
        {tools.map(({ label, icon: Icon, onClick }) => (
          <Button
            key={label}
            aria-label={label}
            onClick={onClick}
            size="icon-sm"
            variant="ghost"
            data-no-drag="true"
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
      className={[
        "group flex items-center justify-between gap-3 rounded-md px-2 py-1 text-left",
        "transition-colors hover:bg-white/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      ].join(" ")}
    >
      <span className="flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
        <span className="text-[13px] font-medium text-foreground">{label}</span>
      </span>
      <span className="flex items-center gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </button>
  );
}
