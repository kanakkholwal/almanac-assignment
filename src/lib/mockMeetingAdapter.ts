import type { TimelineItem } from "@shared/ipc";
import { INITIAL_REPLY_THREAD, SEEDED_SUGGESTIONS } from "@shared/mock-data";

import { createId } from "./utils";

export interface MeetingNotification {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
}

function assistant(content: string): TimelineItem {
  const id = createId("assistant");
  return {
    id,
    kind: "message",
    message: {
      id,
      role: "assistant",
      content,
      createdAt: new Date().toISOString(),
      source: "mock",
    },
  };
}

export function getInitialNotification(): MeetingNotification {
  return {
    id: "meeting-detected",
    title: "Start Alma Notes",
    description: "Take notes and get live suggestions in real time.",
    actionLabel: "Take Notes",
  };
}

export function startNotesTimeline(): TimelineItem[] {
  return [
    {
      id: createId("status"),
      kind: "status",
      text: "Alma is taking notes...",
      emphasis: "accent",
    },
    assistant(
      "I’m listening to the meeting now. Ask me for summaries, follow-ups, or availability checks while notes are running.",
    ),
    {
      id: createId("suggestion"),
      kind: "suggestion",
      suggestion: SEEDED_SUGGESTIONS[0],
    },
  ];
}

export function matchMeetingWorkflow(input: string): TimelineItem[] | null {
  const normalized = input.toLowerCase();

  if (normalized.includes("schedule for tomorrow")) {
    return [
      assistant(
        "you’ve got 3 things tomorrow:\n• 10:00-11:30 am – product sync\n• 2:00-3:30 pm – user research call with Anmol\n• 4:00-5:45 pm – investor call\n\nafternoon is kinda packed 🙂",
      ),
    ];
  }

  if (normalized.includes("move") && normalized.includes("investor") && normalized.includes("friday")) {
    return [
      assistant(
        "done, moved it to Friday, 4 pm.\nhere’s the meet link: https://meet.google.com/sbc-dmkr-uqk\n\nalso, added a 30mins buffer for the prep\nI thought you might need it",
      ),
    ];
  }

  if (normalized.includes("ideation") || normalized.includes("design team")) {
    return [
      assistant(
        "checked everyone’s calendar - looks like everyone is free in the evening\n\nshould I schedule it for Thursday, evening 5pm and send invites to everyone?\n\nalso, you’ve had this meeting 3 times in the last 2 weeks – want me to put together a prep doc for you?",
      ),
      {
        id: createId("thread"),
        kind: "thread",
        thread: INITIAL_REPLY_THREAD,
      },
      {
        id: createId("suggestion"),
        kind: "suggestion",
        suggestion: SEEDED_SUGGESTIONS[1],
      },
    ];
  }

  if (normalized.includes("11am") || normalized.includes("11 am")) {
    return [
      assistant(
        "lemme check\n\nhmmm... 11 AM is a bit tricky\n2 folks have a meeting around then\n\ninstead we can do 1:15 PM, everyone is available",
      ),
    ];
  }

  if (normalized.includes("start alma notes") || normalized.includes("take notes")) {
    return startNotesTimeline();
  }

  return null;
}
