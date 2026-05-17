import { motion } from "framer-motion";
import { CornerLeftDown, CornerUpLeft, FileText, Reply } from "lucide-react";
import { useMemo } from "react";
import { Streamdown } from "streamdown";

import type { AssistantMessage as AssistantMessageData, TimelineItem } from "@shared/ipc";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TranscriptProps {
  items: TimelineItem[];
  /** When provided, each bubble shows a reply affordance on hover. */
  onReply?: (messageId: string) => void;
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

/** One-line summary of a message, for the reply-quote preview. */
function previewOf(message: AssistantMessageData): string {
  const text = message.content.trim();
  if (text) return text;
  if (message.imageUrls && message.imageUrls.length > 0) {
    return message.imageUrls.length > 1
      ? `${message.imageUrls.length} images`
      : "Image";
  }
  return "Message";
}

export function Transcript({ items, onReply }: TranscriptProps) {
  // Lets a bubble resolve the message it replies to (`replyToId`).
  const messageById = useMemo(() => {
    const map = new Map<string, AssistantMessageData>();
    for (const item of items) {
      if (item.kind === "message") map.set(item.message.id, item.message);
    }
    return map;
  }, [items]);

  return (
    <ol className="flex flex-col gap-5">
      {items.map((item, index) => {
        const repliedTo =
          item.kind === "message" && item.message.replyToId
            ? messageById.get(item.message.replyToId)
            : undefined;

        return (
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
              <UserMessage
                message={item.message}
                repliedTo={repliedTo}
                onReply={onReply}
              />
            ) : null}

            {item.kind === "message" && item.message.role !== "user" ? (
              <AssistantMessage
                message={item.message}
                repliedTo={repliedTo}
                onReply={onReply}
              />
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

            {item.kind === "status" ? <StatusDivider text={item.text} /> : null}
          </motion.li>
        );
      })}
    </ol>
  );
}

/** The quoted preview of a message that a bubble is replying to. */
function ReplyQuote({
  message,
  align,
}: {
  message: AssistantMessageData;
  align: "start" | "end";
}) {
  return (
    <div
      className={cn(
        "mb-1 flex max-w-[80%] items-center gap-1.5",
        align === "end" ? "self-end flex-row-reverse" : "self-start",
      )}
    >
      <CornerUpLeft className="size-3 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate rounded-md bg-hover px-2 py-1 font-sans text-[12px] text-muted-foreground">
        {previewOf(message)}
      </span>
    </div>
  );
}

/**
 * The reply-quote shown above an assistant message. Unlike the compact
 * user-side quote, the assistant side leads with a large curved arrow that
 * branches down from the quoted message into the reply.
 */
function AssistantReplyQuote({ message }: { message: AssistantMessageData }) {
  return (
    <div className="mb-1 flex max-w-[80%] items-start gap-1.5 self-start">
      <CornerLeftDown
        aria-hidden
        strokeWidth={1.5}
        className="size-7 shrink-0 text-muted-foreground/40 mt-3.5"
      />
      <span className="mt-1 min-w-0 truncate rounded-xl bg-hover px-3 py-1.5 font-sans text-[12px] text-muted-foreground">
        {previewOf(message)}
      </span>
    </div>
  );
}

/** Hover affordance that starts a reply to this message. */
function ReplyButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      aria-label="Reply to this message"
      title="Reply"
      onClick={onClick}
      size="icon-sm"
      variant="ghost"
      className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
    >
      <Reply />
    </Button>
  );
}

function UserMessage({
  message,
  repliedTo,
  onReply,
}: {
  message: AssistantMessageData;
  repliedTo?: AssistantMessageData;
  onReply?: (messageId: string) => void;
}) {
  const { content, status, imageUrls } = message;
  return (
    <div className="group flex flex-col items-end">
      {repliedTo ? <ReplyQuote message={repliedTo} align="end" /> : null}
      {imageUrls && imageUrls.length > 0 ? (
        <div className="mb-1.5 flex max-w-[80%] flex-wrap justify-end gap-1.5">
          {imageUrls.map((url, index) => (
            <img
              key={`${index}-${url.slice(-16)}`}
              src={url}
              alt={`Captured screen ${index + 1}`}
              className={cn(
                "rounded-lg border border-hairline object-cover",
                imageUrls.length > 1 ? "h-20 w-32" : "max-w-full",
              )}
            />
          ))}
        </div>
      ) : null}
      {content ? (
        <div className="flex max-w-[80%] items-center gap-1">
          {onReply ? <ReplyButton onClick={() => onReply(message.id)} /> : null}
          <div
            className={cn(
              "glass-bubble rounded-2xl px-4 py-2.5",
              "font-sans text-[14px] leading-6 text-foreground wrap-break-word",
            )}
          >
            {renderContent(content)}
          </div>
        </div>
      ) : null}
      {status === "read" ? (
        <div className="mt-1 pr-1 font-sans text-[11px] font-medium text-link">
          Read
        </div>
      ) : status ? (
        <div className="mt-1 pr-1 font-sans text-[11px] capitalize text-muted-foreground">
          {status}
        </div>
      ) : null}
    </div>
  );
}

function AssistantMessage({
  message,
  repliedTo,
  onReply,
}: {
  message: AssistantMessageData;
  repliedTo?: AssistantMessageData;
  onReply?: (messageId: string) => void;
}) {
  const { content } = message;
  if (!content) {
    return (
      <div className="font-sans text-[14px] leading-7 text-foreground">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-pill bg-foreground/70" />
          thinking
        </span>
      </div>
    );
  }
  return (
    <div className="group flex flex-col items-start">
      {repliedTo ? <AssistantReplyQuote message={repliedTo} /> : null}
      <div className="flex w-full items-start gap-1">
        <Streamdown
          className={cn(
            "min-w-0 flex-1 font-sans text-[14px] leading-7 text-foreground wrap-break-word",
            "[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4",
            "[&_pre]:rounded-sm [&_pre]:border [&_pre]:border-hairline",
            "[&_code]:font-mono [&_code]:text-[13px]",
          )}
        >
          {content}
        </Streamdown>
        {onReply ? <ReplyButton onClick={() => onReply(message.id)} /> : null}
      </div>
    </div>
  );
}

function ThreadMessage({ label, preview }: { label: string; preview: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="glass-bubble max-w-[80%] rounded-2xl px-4 py-2.5 font-sans text-[13.5px] leading-6 text-foreground/85">
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
    <div className="glass-bubble max-w-[84%] rounded-xl p-4">
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
