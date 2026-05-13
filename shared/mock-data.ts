import type {
  MeetingSuggestion,
  ReplyThread,
  TimelineItem,
} from "./ipc";

export const INITIAL_REPLY_THREAD: ReplyThread = {
  id: "availability-thread",
  label: "3 replies",
  replies: 3,
  preview: "checked everyone's calendar - looks like everyone is free in the evening",
};

export const SEEDED_SUGGESTIONS: MeetingSuggestion[] = [
  {
    id: "prep-doc",
    title: "Prep doc ready",
    description: "I summarized your last few calls and added talking points for the ideation session.",
    actionLabel: "Open doc",
    secondaryLabel: "Later",
  },
  {
    id: "availability",
    title: "Team availability",
    description: "Everyone is free Thursday evening. I can draft the invite and hold 30 mins for prep.",
    actionLabel: "Draft invite",
    secondaryLabel: "Skip",
  },
];

export const SEEDED_TIMELINE: TimelineItem[] = [
  {
    id: "seed-user-1",
    kind: "message",
    message: {
      id: "seed-user-1",
      role: "user",
      content: "hii - can you check my schedule for tomorrow?",
      createdAt: new Date().toISOString(),
      status: "read",
      source: "mock",
    },
  },
  {
    id: "seed-assistant-1",
    kind: "message",
    message: {
      id: "seed-assistant-1",
      role: "assistant",
      content:
        "you’ve got 3 things tomorrow:\n• 10:00-11:30 am – product sync\n• 2:00-3:30 pm – user research call with Anmol\n• 4:00-5:45 pm – investor call\n\nafternoon is kinda packed 🙂",
      createdAt: new Date().toISOString(),
      source: "mock",
    },
  },
  {
    id: "seed-user-2",
    kind: "message",
    message: {
      id: "seed-user-2",
      role: "user",
      content: "also, move the investor call to friday",
      createdAt: new Date().toISOString(),
      status: "read",
      source: "mock",
    },
  },
  {
    id: "seed-assistant-2",
    kind: "message",
    message: {
      id: "seed-assistant-2",
      role: "assistant",
      content:
        "done, moved it to Friday, 4 pm.\nhere’s the meet link: https://meet.google.com/sbc-dmkr-uqk\n\nalso, added a 30mins buffer for the prep\nI thought you might need it",
      createdAt: new Date().toISOString(),
      source: "mock",
    },
  },
  {
    id: "seed-thread",
    kind: "thread",
    thread: INITIAL_REPLY_THREAD,
  },
];
