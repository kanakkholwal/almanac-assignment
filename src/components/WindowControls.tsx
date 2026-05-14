import { Minus, Square, X } from "lucide-react";

import type { AppRuntimeInfo, WindowState } from "@shared/ipc";

import { cn } from "@/lib/utils";

interface WindowControlsProps {
  runtime: AppRuntimeInfo | null;
  windowState: WindowState | null;
}

const TRAFFIC_LIGHTS = [
  {
    label: "Close window",
    color: "bg-[#ff5f57] hover:bg-[#ff5f57]/90",
    action: "close" as const,
  },
  {
    label: "Minimize window",
    color: "bg-[#febc2e] hover:bg-[#febc2e]/90",
    action: "minimize" as const,
  },
  {
    label: "Maximize window",
    color: "bg-[#28c840] hover:bg-[#28c840]/90",
    action: "maximize" as const,
  },
];

export function WindowControls({ runtime, windowState }: WindowControlsProps) {
  const platform = runtime?.platform ?? "win32";

  if (platform === "darwin") {
    return (
      <div className="group flex items-center gap-[7px]" data-no-drag="true">
        {TRAFFIC_LIGHTS.map(({ label, color, action }) => (
          <button
            key={action}
            aria-label={
              action === "maximize" && windowState?.isMaximized
                ? "Restore window"
                : label
            }
            className={cn(
              "size-[11px] rounded-full ring-1 ring-inset ring-black/10 transition-opacity",
              color,
              "opacity-90 group-hover:opacity-100",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            onClick={() => {
              if (action === "close") void window.almanac.closeWindow();
              else if (action === "minimize") void window.almanac.minimizeWindow();
              else void window.almanac.toggleMaximizeWindow();
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5" data-no-drag="true">
      <ControlButton
        aria-label="Minimize window"
        onClick={() => void window.almanac.minimizeWindow()}
      >
        <Minus className="size-3.5" />
      </ControlButton>
      <ControlButton
        aria-label={windowState?.isMaximized ? "Restore window" : "Maximize window"}
        onClick={() => void window.almanac.toggleMaximizeWindow()}
      >
        <Square className="size-3" />
      </ControlButton>
      <ControlButton
        aria-label="Close window"
        onClick={() => void window.almanac.closeWindow()}
        className="hover:bg-destructive hover:text-destructive-foreground"
      >
        <X className="size-3.5" />
      </ControlButton>
    </div>
  );
}

function ControlButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-foreground/70 transition-colors",
        "hover:bg-white/[0.08] hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
