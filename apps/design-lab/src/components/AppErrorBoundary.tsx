import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { reportChildRuntimeFailure } from "../api/performance-telemetry";

const CHUNK_RELOAD_KEY = "star-monsters:chunk-reload";
const CHUNK_RELOAD_WINDOW_MS = 30_000;

function readReloadMarker() {
  try {
    return Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY));
  } catch {
    return Number.NaN;
  }
}

function writeReloadMarker() {
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

function clearReloadMarker() {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    // Ignore storage restrictions in private browsing.
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isChunkLoadFailure(error: unknown) {
  return /dynamically imported module|importing a module script failed|failed to fetch.*module|chunkloaderror|loading chunk|module script/i.test(
    errorMessage(error),
  );
}

function failingAssetPath(error: unknown) {
  const message = errorMessage(error);
  const url = message.match(/https?:\/\/[^\s)"']+/)?.[0];
  if (url) {
    try {
      return new URL(url).pathname.slice(0, 160);
    } catch {
      // Fall through to the relative asset matcher.
    }
  }
  return message.match(/\/assets\/[^\s)"']+/)?.[0]?.slice(0, 160);
}

type AppErrorBoundaryState = {
  error: unknown;
  reloading: boolean;
};

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
    reloading: false,
  };

  private clearRetryTimer: number | null = null;
  private reloadTimer: number | null = null;

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error, reloading: false };
  }

  componentDidMount() {
    this.clearRetryTimer = window.setTimeout(() => {
      if (!this.state.error) {
        clearReloadMarker();
      }
    }, 15_000);
  }

  componentDidCatch(error: unknown, _info: ErrorInfo) {
    const chunkFailure = isChunkLoadFailure(error);
    reportChildRuntimeFailure({
      operation: chunkFailure ? "chunk_load_failed" : "render_failed",
      path: failingAssetPath(error),
    });

    if (!chunkFailure) return;

    const previousReloadAt = readReloadMarker();
    if (
      Number.isFinite(previousReloadAt) &&
      Date.now() - previousReloadAt < CHUNK_RELOAD_WINDOW_MS
    ) {
      return;
    }

    if (!writeReloadMarker()) return;
    this.setState({ reloading: true });
    this.reloadTimer = window.setTimeout(() => {
      window.location.reload();
    }, 250);
  }

  componentWillUnmount() {
    if (this.clearRetryTimer !== null) {
      window.clearTimeout(this.clearRetryTimer);
    }
    if (this.reloadTimer !== null) {
      window.clearTimeout(this.reloadTimer);
    }
  }

  private reload = () => {
    clearReloadMarker();
    window.location.reload();
  };

  private returnToTasks = () => {
    clearReloadMarker();
    window.location.replace(
      `${window.location.pathname}${window.location.search}#home`,
    );
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="app-error-page" role="alert">
        <section className="app-error-panel">
          <span className="app-error-panel__mark" aria-hidden="true">!</span>
          <h1>
            {this.state.reloading
              ? "页面资源已更新"
              : "页面没有正确打开"}
          </h1>
          <p>
            {this.state.reloading
              ? "正在重新打开，请稍候…"
              : "可以重新加载页面，进行中的任务不会丢失。"}
          </p>
          {!this.state.reloading ? (
            <div className="app-error-panel__actions">
              <button type="button" onClick={this.reload}>重新加载</button>
              <button type="button" onClick={this.returnToTasks}>返回任务</button>
            </div>
          ) : (
            <span className="child-data-state__spinner" aria-hidden="true" />
          )}
        </section>
      </main>
    );
  }
}
