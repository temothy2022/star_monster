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
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#f36f45",
          colorInfo: "#f36f45",
          colorSuccess: "#2f9e72",
          colorText: "#263b59",
          borderRadius: 8,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <AntApp>
        <Refine
          resources={[
            { name: "overview", meta: { label: "成长总览" } },
            { name: "tasks", meta: { label: "任务配置" } },
            { name: "learning", meta: { label: "学习内容" } },
            { name: "rewards", meta: { label: "奖励中心" } },
            { name: "settings", meta: { label: "智能与设置" } },
          ]}
          options={{ disableTelemetry: true, syncWithLocation: false }}
        >
          <App />
        </Refine>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
