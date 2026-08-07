import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { installVersionRefresh } from "./version-refresh";
import "./styles.css";

installVersionRefresh();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
