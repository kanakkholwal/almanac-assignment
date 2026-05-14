import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NotificationView } from "./features/meeting/NotificationView";
import "./index.css";

function resolveView(): "notification" | "main" {
  if (window.almanac?.view === "notification") return "notification";
  if (window.location.hash.includes("notification")) return "notification";
  return "main";
}

const Root = resolveView() === "notification" ? NotificationView : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>,
);
