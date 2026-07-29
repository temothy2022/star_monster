import type {
  HanziCharacter,
  HanziLearningSession,
} from "../api/child-api";

const MAX_BACKGROUND_REQUESTS = 4;
const MAX_AUDIO_CACHE_ENTRIES = 180;
const audioCache = new Map<string, HTMLAudioElement>();
const audioObjectUrls = new Map<string, string>();

function isAudioUrl(url: string) {
  return /\.(?:aac|m4a|mp3|ogg|wav)(?:[?#].*)?$/i.test(url);
}

function releaseAudioObjectUrl(url: string) {
  const objectUrl = audioObjectUrls.get(url);
  if (!objectUrl) return;
  URL.revokeObjectURL(objectUrl);
  audioObjectUrls.delete(url);
}

function createCachedAudio(url: string, source = url) {
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = source;
  audioCache.set(url, audio);

  while (audioCache.size > MAX_AUDIO_CACHE_ENTRIES) {
    const oldest = audioCache.entries().next().value as
      | [string, HTMLAudioElement]
      | undefined;
    if (!oldest) break;
    oldest[1].pause();
    oldest[1].removeAttribute("src");
    oldest[1].load();
    releaseAudioObjectUrl(oldest[0]);
    audioCache.delete(oldest[0]);
  }

  return audio;
}

export function getHanziAudioElement(url: string): HTMLAudioElement {
  const cached = audioCache.get(url);
  if (cached) {
    // Move the entry to the end so the bounded map behaves like an LRU cache.
    audioCache.delete(url);
    audioCache.set(url, cached);
    return cached;
  }
  return createCachedAudio(url);
}

async function preloadAudio(url: string, signal: AbortSignal) {
  const cached = audioCache.get(url);
  if (
    cached &&
    audioObjectUrls.has(url) &&
    cached.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  ) {
    return true;
  }

  const response = await fetch(url, {
    cache: "force-cache",
    credentials: "same-origin",
    signal,
  });
  if (!response.ok) {
    throw new Error(`Audio preload failed with ${response.status}`);
  }
  const blob = await response.blob();
  if (signal.aborted) return false;

  const objectUrl = URL.createObjectURL(blob);
  const audio = cached ?? createCachedAudio(url, objectUrl);
  if (cached) {
    cached.pause();
    releaseAudioObjectUrl(url);
    cached.src = objectUrl;
  }
  audioObjectUrls.set(url, objectUrl);

  return new Promise<boolean>((resolve) => {
    let timeout: number | undefined;
    const finish = (loaded: boolean) => {
      audio.removeEventListener("loadeddata", handleLoaded);
      audio.removeEventListener("error", handleError);
      signal.removeEventListener("abort", handleAbort);
      if (timeout !== undefined) window.clearTimeout(timeout);
      resolve(loaded);
    };
    const handleLoaded = () => finish(true);
    const handleError = () => finish(false);
    const handleAbort = () => finish(false);
    audio.addEventListener("loadeddata", handleLoaded, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    signal.addEventListener("abort", handleAbort, { once: true });
    timeout = window.setTimeout(() => finish(false), 3_000);
    audio.load();
  });
}

function characterAudioUrls(character: HanziCharacter): string[] {
  return [
    character.characterAudioUrl,
    character.sentenceAudioUrl,
    ...character.wordAudioUrls,
  ].filter(
    (url): url is string =>
      typeof url === "string" && url.trim().length > 0,
  );
}

export function collectHanziSessionAssetUrls(
  session: HanziLearningSession,
): string[] {
  const characterById = new Map(
    session.characters.map((character) => [character.id, character]),
  );
  const reviewCharacterIds = [
    session.reviewCharacterIds[session.reviewIndex],
    ...session.reviewCharacterIds,
  ].filter((id): id is string => Boolean(id));
  const newCharacterIds = [
    session.newCharacterIds[session.newIndex],
    ...session.newCharacterIds,
  ].filter((id): id is string => Boolean(id));
  const seenUrls = new Set<string>();
  const urls: string[] = [];
  const addUrl = (url?: string | null) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    urls.push(url);
  };
  const addImage = (character?: HanziCharacter) => {
    if (!character || character.imageKey === "default-hanzi") return;
    addUrl(character.imageKey);
  };

  for (const characterId of [...reviewCharacterIds, ...newCharacterIds]) {
    const character = characterById.get(characterId);
    addImage(character);
  }

  for (const characterId of reviewCharacterIds) {
    addUrl(characterById.get(characterId)?.characterAudioUrl);
  }
  for (const characterId of newCharacterIds) {
    const character = characterById.get(characterId);
    if (!character) continue;
    for (const url of characterAudioUrls(character)) addUrl(url);
  }
  for (const question of session.questions) {
    addUrl(characterById.get(question.targetId)?.sentenceAudioUrl);
  }

  return urls;
}

export async function preloadHanziSessionAssets(
  session: HanziLearningSession,
  signal: AbortSignal,
  onProgress?: (progress: {
    total: number;
    completed: number;
    failed: number;
  }) => void,
): Promise<{ total: number; completed: number; failed: number }> {
  const urls = collectHanziSessionAssetUrls(session);
  let cursor = 0;
  let completed = 0;
  let failed = 0;
  onProgress?.({ total: urls.length, completed, failed });

  async function worker() {
    while (!signal.aborted) {
      const index = cursor;
      cursor += 1;
      const url = urls[index];
      if (!url) return;

      let loaded = false;
      try {
        if (isAudioUrl(url)) {
          loaded = await preloadAudio(url, signal);
        } else {
          const response = await fetch(url, {
            cache: "force-cache",
            credentials: "same-origin",
            signal,
          });
          if (!response.ok) {
            throw new Error(`Asset preload failed with ${response.status}`);
          }
          await response.arrayBuffer();
          loaded = true;
        }
      } catch (error) {
        if (signal.aborted) return;
        console.debug("Hanzi asset preload skipped", url, error);
      } finally {
        if (!signal.aborted) {
          completed += 1;
          if (!loaded) failed += 1;
          onProgress?.({ total: urls.length, completed, failed });
        }
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_BACKGROUND_REQUESTS, urls.length) },
      () => worker(),
    ),
  );
  return { total: urls.length, completed, failed };
}
