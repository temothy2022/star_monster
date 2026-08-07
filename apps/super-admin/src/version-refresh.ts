type VersionFile = {
  version?: string;
};

const currentVersion = import.meta.env.VITE_APP_VERSION;
const versionUrl = `${import.meta.env.BASE_URL}version.json`;
const reloadStorageKey = "star-monsters-last-version-reload";
let checking = false;

function reloadWithVersion(version: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("appVersion", version);
  window.location.replace(url.toString());
}

async function checkForNewVersion() {
  if (!currentVersion || currentVersion === "dev" || checking) return;
  checking = true;
  try {
    const response = await fetch(`${versionUrl}?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return;
    const data = (await response.json()) as VersionFile;
    const nextVersion = data.version;
    if (!nextVersion || nextVersion === currentVersion) return;
    if (sessionStorage.getItem(reloadStorageKey) === nextVersion) return;
    sessionStorage.setItem(reloadStorageKey, nextVersion);
    reloadWithVersion(nextVersion);
  } catch {
    // Version checks must never block normal app usage.
  } finally {
    checking = false;
  }
}

export function installVersionRefresh() {
  if (!currentVersion || currentVersion === "dev") return;
  window.setTimeout(() => void checkForNewVersion(), 1500);
  window.addEventListener("focus", () => void checkForNewVersion());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkForNewVersion();
  });
}
