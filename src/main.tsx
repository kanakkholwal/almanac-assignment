import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NotificationView } from "./features/meeting/NotificationView";
import { NotesView } from "./features/notes/NotesView";
import "./index.css";

type View = "main" | "notification" | "notes";

function resolveView(): View {
  if (window.almanac?.view === "notification") return "notification";
  if (window.almanac?.view === "notes") return "notes";
  if (window.location.hash.includes("notification")) return "notification";
  if (window.location.hash.includes("notes")) return "notes";
  return "main";
}

const view = resolveView();
const Root = view === "notification" ? NotificationView : view === "notes" ? NotesView : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>,
);
