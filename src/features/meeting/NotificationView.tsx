import { useEffect, useState } from "react";

import { MeetingPrompt } from "./MeetingPrompt";

interface NotificationPayload {
  title: string;
  description: string;
  actionLabel: string;
}

const FALLBACK: NotificationPayload = {
  title: "Start Alma Notes",
  description: "Take notes & get suggestions in real time",
  actionLabel: "Take Notes",
};

export function NotificationView() {
  const [payload, setPayload] = useState<NotificationPayload | null>(null);

  useEffect(() => {
    const off = window.almanac?.onNotificationData?.((data) => setPayload(data));
    const timeout = window.setTimeout(() => setPayload((p) => p ?? FALLBACK), 250);

    return () => {
      window.clearTimeout(timeout);
      off?.();
    };
  }, []);

  return (
    <div className="h-screen w-screen bg-transparent">
      <MeetingPrompt
        prompt={payload}
        onStart={() => void window.almanac?.notificationStartNotes()}
        onDismiss={() => void window.almanac?.notificationDismiss()}
      />
    </div>
  );
}
