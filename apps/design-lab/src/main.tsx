import React from "react";
import ReactDOM from "react-dom/client";
import "@star-monsters/ui/styles.css";
import { App } from "./App";
import { MascotProvider } from "./mascots";
import "./app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
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
  </React.StrictMode>
);
