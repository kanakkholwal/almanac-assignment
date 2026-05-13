import { Minus, Square, X } from "lucide-react";

import type { AppRuntimeInfo, WindowState } from "@shared/ipc";

import { Button } from "./ui/button";

interface WindowControlsProps {
  runtime: AppRuntimeInfo | null;
  windowState: WindowState | null;
}

export function WindowControls({ runtime, windowState }: WindowControlsProps) {
  const platform = runtime?.platform ?? "win32";

  const controls = (
    <>
      <Button
        aria-label="Minimize window"
        onClick={() => void window.almanac.minimizeWindow()}
        size="icon"
        variant="ghost"
      >
        <Minus size={14} />
      </Button>
      <Button
        aria-label={windowState?.isMaximized ? "Restore window" : "Maximize window"}
        onClick={() => void window.almanac.toggleMaximizeWindow()}
        size="icon"
        variant="ghost"
      >
        <Square size={11} />
      </Button>
      <Button
        aria-label="Close window"
        className="hover:bg-rose-500/20 hover:text-rose-100"
        onClick={() => void window.almanac.closeWindow()}
        size="icon"
        variant="ghost"
      >
        <X size={14} />
      </Button>
    </>
  );

  if (platform === "darwin") {
    return (
      <div className="flex items-center gap-2">
        <button
          aria-label="Close window"
          className="h-3 w-3 rounded-full bg-[#ff5f57]"
          data-no-drag="true"
          onClick={() => void window.almanac.closeWindow()}
        />
        <button
          aria-label="Minimize window"
          className="h-3 w-3 rounded-full bg-[#febc2e]"
          data-no-drag="true"
          onClick={() => void window.almanac.minimizeWindow()}
        />
        <button
          aria-label={windowState?.isMaximized ? "Restore window" : "Maximize window"}
          className="h-3 w-3 rounded-full bg-[#28c840]"
          data-no-drag="true"
          onClick={() => void window.almanac.toggleMaximizeWindow()}
        />
      </div>
    );
  }

  return <div className="flex items-center gap-1">{controls}</div>;
}
