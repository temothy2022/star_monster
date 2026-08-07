import React from "react";
import ReactDOM from "react-dom/client";
import "@star-monsters/ui/styles.css";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { MascotProvider } from "./mascots";
import { installVersionRefresh } from "./version-refresh";
import "./app.css";

installVersionRefresh();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <MascotProvider>
        <React.Suspense
          fallback={
            <div className="task-page task-page--loading" aria-live="polite">
              <div className="child-data-state">
                <span className="child-data-state__spinner" aria-hidden="true" />
                <p>正在打开星宠基地…</p>
              </div>
            </div>
          }
        >
          <App />
        </React.Suspense>
      </MascotProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
