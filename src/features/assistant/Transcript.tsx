import { motion } from "framer-motion";
import { CheckCheck, FileText } from "lucide-react";

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
          key={`link-${index}`}
          className="wrap-break-word text-foreground underline underline-offset-4 transition-colors hover:text-foreground/80"
          href={part}
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
    <ol className="flex flex-col gap-5">
      {items.map((item, index) => (
        <motion.li
          key={item.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: Math.min(index * 0.02, 0.16),
            duration: 0.18,
            ease: "easeOut",
          }}
        >
          {item.kind === "message" && item.message.role === "user" ? (
            <UserMessage content={item.message.content} status={item.message.status} />
          ) : null}

          {item.kind === "message" && item.message.role !== "user" ? (
            <AssistantMessage content={item.message.content} />
          ) : null}

          {item.kind === "thread" ? (
            <ThreadMessage label={item.thread.label} preview={item.thread.preview} />
          ) : null}

          {item.kind === "suggestion" ? (
            <Suggestion
              title={item.suggestion.title}
              description={item.suggestion.description}
              actionLabel={item.suggestion.actionLabel}
              secondaryLabel={item.suggestion.secondaryLabel}
            />
          ) : null}

          {item.kind === "status" ? (
            <StatusDivider text={item.text} />
          ) : null}
        </motion.li>
      ))}
    </ol>
  );
}

function UserMessage({
  content,
  status,
}: {
  content: string;
  status?: "sending" | "delivered" | "read";
}) {
  return (
    <div className="flex flex-col items-end">
      <div
        className={cn(
          "max-w-[78%] rounded-sm border border-hairline bg-canvas-soft px-3.5 py-2",
          "font-sans text-[14px] leading-6 text-foreground",
        )}
      >
        {renderContent(content)}
      </div>
      {status === "read" ? (
        <div className="mt-1 flex items-center gap-1 pr-1 font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">
          <CheckCheck className="size-3 text-foreground/70" />
          <span>Read</span>
        </div>
      ) : status ? (
        <div className="mt-1 pr-1 font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">
          {status}
        </div>
      ) : null}
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="font-sans text-[14px] leading-7 text-foreground whitespace-pre-wrap wrap-break-word">
      {content ? (
        renderContent(content)
      ) : (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-pill bg-foreground/70" />
          thinking
        </span>
      )}
    </div>
  );
}

function ThreadMessage({ label, preview }: { label: string; preview: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[78%] rounded-sm border border-hairline bg-canvas-soft px-3.5 py-2 font-sans text-[13.5px] leading-6 text-foreground/85">
        {preview}
      </div>
      <div className="pr-1 font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Suggestion({
  title,
  description,
  actionLabel,
  secondaryLabel,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="max-w-[82%] rounded-sm border border-hairline bg-canvas-card p-4">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">
        <FileText className="size-3 text-foreground/70" />
        {title}
      </div>
      <p className="mb-3 font-sans text-[13.5px] leading-6 text-foreground/85">{description}</p>
      <div className="flex gap-2">
        {actionLabel ? (
          <Button size="sm" variant="outline">
            {actionLabel}
          </Button>
        ) : null}
        {secondaryLabel ? (
          <Button size="sm" variant="ghost">
            {secondaryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function StatusDivider({ text }: { text: string }) {
  return (
    <div
      role="separator"
      className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground"
    >
      <span className="h-px flex-1 bg-hairline" />
      <span>{text}</span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}
