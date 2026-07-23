import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/baloo-2/600.css";
import "@star-monsters/ui/styles.css";
import { App } from "./App";
import { MascotProvider } from "./mascots";
import "./app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MascotProvider>
      <App />
    </MascotProvider>
  </React.StrictMode>
);
