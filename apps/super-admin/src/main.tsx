import React from "react";
import ReactDOM from "react-dom/client";
import { Refine } from "@refinedev/core";
import { App as AntApp, ConfigProvider } from "antd";
import { App } from "./App";
import { installVersionRefresh } from "./version-refresh";
import "./styles.css";
import "antd/dist/reset.css";

installVersionRefresh();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider theme={{ token: { colorPrimary: "#3f6f9f", colorInfo: "#3f6f9f", colorSuccess: "#2f8f71", colorText: "#27384f", borderRadius: 8, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif' } }}>
      <AntApp>
        <Refine resources={[{ name: "operations" }, { name: "accounts" }, { name: "content" }, { name: "pets" }, { name: "ai" }, { name: "system" }]} options={{ disableTelemetry: true, syncWithLocation: false }}>
          <App />
        </Refine>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
