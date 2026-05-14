import { motion } from "framer-motion";
import { CheckCheck, FileText, Sparkles } from "lucide-react";

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
          className="break-words font-medium text-primary underline-offset-4 transition-colors hover:underline"
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
    <ol className="flex flex-col gap-4">
      {items.map((item, index) => (
        <motion.li
          key={item.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: Math.min(index * 0.02, 0.18),
            duration: 0.22,
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
            <StatusDivider text={item.text} emphasis={item.emphasis} />
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
          "max-w-[78%] rounded-2xl rounded-br-md px-3.5 py-2",
          "bg-primary/90 text-primary-foreground shadow-sm",
          "text-[13.5px] leading-6",
        )}
      >
        {renderContent(content)}
      </div>
      {status === "read" ? (
        <div className="mt-1 flex items-center gap-1 pr-1 text-[10.5px] font-medium text-muted-foreground">
          <CheckCheck className="size-3 text-primary" />
          <span>Read</span>
        </div>
      ) : status ? (
        <div className="mt-1 pr-1 text-[10.5px] font-medium text-muted-foreground capitalize">
          {status}
        </div>
      ) : null}
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-inset ring-primary/25"
      >
        <Sparkles className="size-3" />
      </span>
      <div className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13.5px] leading-7 text-foreground">
        {content ? (
          renderContent(content)
        ) : (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" />
            thinking…
          </span>
        )}
      </div>
    </div>
  );
}

function ThreadMessage({ label, preview }: { label: string; preview: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-[78%] rounded-2xl rounded-br-md border border-border bg-card/60 px-3.5 py-2 text-[13px] leading-6 text-foreground/85">
        {preview}
      </div>
      <div className="pr-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
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
    <div className="max-w-[82%] rounded-2xl border border-border bg-card/70 p-3.5 shadow-sm">
      <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-foreground">
        <FileText className="size-3.5 text-accent" />
        {title}
      </div>
      <p className="mb-3 text-[12.5px] leading-5 text-muted-foreground">{description}</p>
      <div className="flex gap-2">
        {actionLabel ? (
          <Button size="sm" variant="default">
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

function StatusDivider({
  text,
  emphasis,
}: {
  text: string;
  emphasis?: "accent" | "default";
}) {
  return (
    <div
      role="separator"
      className={cn(
        "flex items-center gap-2.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground",
        emphasis === "accent" && "text-success",
      )}
    >
      <span className="h-px flex-1 bg-border" />
      <span>{text}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
