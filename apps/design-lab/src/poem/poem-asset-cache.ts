import type { Poem } from "../api/child-api";

const MAX_AUDIO_CACHE_ENTRIES = 16;
const audioCache = new Map<string, HTMLAudioElement>();

function createCachedAudio(url: string) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  audioCache.set(url, audio);

  while (audioCache.size > MAX_AUDIO_CACHE_ENTRIES) {
    const oldest = audioCache.entries().next().value as
      | [string, HTMLAudioElement]
      | undefined;
    if (!oldest) break;
    oldest[1].pause();
    oldest[1].removeAttribute("src");
    oldest[1].load();
    audioCache.delete(oldest[0]);
  }

  return audio;
}

export function getPoemAudioElement(url: string): HTMLAudioElement {
  const cached = audioCache.get(url);
  if (cached) {
    audioCache.delete(url);
    audioCache.set(url, cached);
    return cached;
  }
  return createCachedAudio(url);
}

async function preloadAudio(url: string, signal: AbortSignal) {
  const audio = getPoemAudioElement(url);
  if (
    !audio.paused ||
    audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    let timeout: number | undefined;
    const finish = () => {
      audio.removeEventListener("loadeddata", finish);
      audio.removeEventListener("error", finish);
      signal.removeEventListener("abort", finish);
      if (timeout !== undefined) window.clearTimeout(timeout);
      resolve();
    };
    audio.addEventListener("loadeddata", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    signal.addEventListener("abort", finish, { once: true });
    timeout = window.setTimeout(finish, 5_000);
    audio.load();
  });
}

export async function preloadPoemAssets(
  poems: Poem[],
  signal: AbortSignal,
): Promise<void> {
  const urls = poems.flatMap((poem) =>
    [poem.imageUrl, poem.audioUrl].filter(
      (url): url is string => Boolean(url?.trim()),
    ),
  );

  await Promise.all(
    urls.map(async (url) => {
      try {
        if (/\.mp3(?:[?#].*)?$/i.test(url)) {
          await preloadAudio(url, signal);
          return;
        }
        const response = await fetch(url, {
          cache: "force-cache",
          credentials: "same-origin",
          signal,
        });
        if (response.ok) await response.arrayBuffer();
      } catch {
        // Background warming must never block the learning page.
      }
    }),
  );
}
