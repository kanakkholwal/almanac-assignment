import { motion } from "framer-motion";
import { CornerDownLeft, FileText } from "lucide-react";

import type { TimelineItem } from "@shared/ipc";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TranscriptProps {
  items: TimelineItem[];
}

const URL_PATTERN = /(https?:\/\/[^\s)]+)/g;

function renderContent(content: string) {
  const segments = content.split(URL_PATTERN);
  return segments.map((part, index) => {
    if (URL_PATTERN.test(part)) {
      URL_PATTERN.lastIndex = 0;
      return (
        <a
          className="break-words text-surface-cyan underline underline-offset-4 hover:text-surface-glow"
          href={part}
          key={`link-${index}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          {part}
        </a>
      );
    }
    return <span key={`text-${index}`}>{part}</span>;
  });
}

export function Transcript({ items }: TranscriptProps) {
  return (
    <div className="flex flex-col gap-3.5">
      {items.map((item, index) => (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 10 }}
          key={item.id}
          transition={{ delay: Math.min(index * 0.025, 0.22), duration: 0.26 }}
        >
          {item.kind === "message" && item.message.role === "user" ? (
            <div className="flex flex-col items-end">
              <div className="message-surface max-w-[80%] rounded-[1.15rem] px-4 py-2.5 text-[13.5px] leading-6 text-surface-ink">
                {renderContent(item.message.content)}
              </div>
              {item.message.status ? (
                <div className="mt-1 pr-1 text-[11px] font-medium text-surface-cyan">
                  {item.message.status[0].toUpperCase() + item.message.status.slice(1)}
                </div>
              ) : null}
            </div>
          ) : null}

          {item.kind === "message" && item.message.role !== "user" ? (
            <div className="flex items-start gap-2">
              <CornerDownLeft
                className="mt-1 shrink-0 -scale-x-100 text-surface-ink/55"
                size={16}
              />
              <div className="whitespace-pre-wrap break-words text-[13.5px] leading-7 text-surface-ink">
                {item.message.content
                  ? renderContent(item.message.content)
                  : (
                      <span className="inline-flex items-center gap-1.5 text-surface-muted">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-surface-glow" />
                        thinking…
                      </span>
                    )}
              </div>
            </div>
          ) : null}

          {item.kind === "thread" ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="message-surface max-w-[80%] rounded-[1.2rem] px-4 py-2.5 text-[13px] leading-6 text-surface-ink/85">
                {item.thread.preview}
              </div>
              <div className="inline-flex items-center gap-2 pr-1 text-[11px] font-medium text-surface-muted">
                <span>{item.thread.label}</span>
                <CornerDownLeft className="text-surface-muted/70" size={14} />
              </div>
            </div>
          ) : null}

          {item.kind === "suggestion" ? (
            <div className="message-surface max-w-[80%] rounded-[1.2rem] p-3.5">
              <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-surface-ink">
                <FileText size={14} />
                {item.suggestion.title}
              </div>
              <p className="mb-3 text-[12.5px] leading-5 text-surface-muted">
                {item.suggestion.description}
              </p>
              <div className="flex gap-2">
                {item.suggestion.actionLabel ? (
                  <Button size="sm" variant="accent">
                    {item.suggestion.actionLabel}
                  </Button>
                ) : null}
                {item.suggestion.secondaryLabel ? (
                  <Button size="sm" variant="ghost">
                    {item.suggestion.secondaryLabel}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {item.kind === "status" ? (
            <div
              className={cn(
                "flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-surface-muted",
                item.emphasis === "accent" && "text-emerald-300",
              )}
            >
              <span className="h-px flex-1 bg-white/10" />
              <span>{item.text}</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}
