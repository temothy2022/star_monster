import type { Poem } from "../api/child-api";
import { createManagedHtmlAudio } from "../audio/queued-playback";

const MAX_AUDIO_CACHE_ENTRIES = 16;
type AudioCacheEntry = {
  audio: HTMLAudioElement;
  objectUrl: string | null;
  ready: Promise<void>;
};

const audioCache = new Map<string, AudioCacheEntry>();

function createCachedAudio(url: string) {
  const audio = createManagedHtmlAudio();
  audio.preload = "auto";
  const entry: AudioCacheEntry = {
    audio,
    objectUrl: null,
    ready: Promise.resolve(),
  };
  entry.ready = fetch(url, {
    cache: "force-cache",
    credentials: "same-origin",
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Audio preload failed with ${response.status}`);
      return response.blob();
    })
    .then((blob) => {
      entry.objectUrl = URL.createObjectURL(blob);
      audio.src = entry.objectUrl;
      audio.load();
    })
    .catch(() => {
      // Keep playback available even when the explicit memory warmup fails.
      audio.src = url;
      audio.load();
    });
  audioCache.set(url, entry);

  while (audioCache.size > MAX_AUDIO_CACHE_ENTRIES) {
    const oldest = audioCache.entries().next().value as
      | [string, AudioCacheEntry]
      | undefined;
    if (!oldest) break;
    oldest[1].audio.pause();
    oldest[1].audio.removeAttribute("src");
    oldest[1].audio.load();
    if (oldest[1].objectUrl) URL.revokeObjectURL(oldest[1].objectUrl);
    audioCache.delete(oldest[0]);
  }

  return entry;
}

export async function getPoemAudioElement(
  url: string,
): Promise<HTMLAudioElement> {
  const cached = audioCache.get(url);
  if (cached) {
    audioCache.delete(url);
    audioCache.set(url, cached);
    await cached.ready;
    return cached.audio;
  }
  const entry = createCachedAudio(url);
  await entry.ready;
  return entry.audio;
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
          await getPoemAudioElement(url);
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
