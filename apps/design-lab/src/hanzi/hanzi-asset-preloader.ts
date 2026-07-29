import type {
  HanziCharacter,
  HanziLearningSession,
} from "../api/child-api";

const MAX_BACKGROUND_REQUESTS = 3;
const MAX_AUDIO_CACHE_ENTRIES = 180;
const audioCache = new Map<string, HTMLAudioElement>();

function isAudioUrl(url: string) {
  return /\.(?:aac|m4a|mp3|ogg|wav)(?:[?#].*)?$/i.test(url);
}

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
  const audio = getHanziAudioElement(url);
  if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;

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
  const currentQuestion = session.questions[session.questionIndex];
  const orderedCharacterIds = [
    session.reviewCharacterIds[session.reviewIndex],
    session.newCharacterIds[session.newIndex],
    currentQuestion?.targetId,
    ...(currentQuestion?.optionIds ?? []),
    ...session.reviewCharacterIds,
    ...session.newCharacterIds,
    ...session.questions.flatMap((question) => [
      question.targetId,
      ...question.optionIds,
    ]),
  ].filter((id): id is string => Boolean(id));

  const seenCharacterIds = new Set<string>();
  const seenUrls = new Set<string>();
  const imageUrls: string[] = [];
  const audioUrls: string[] = [];

  for (const characterId of orderedCharacterIds) {
    if (seenCharacterIds.has(characterId)) continue;
    seenCharacterIds.add(characterId);
    const character = characterById.get(characterId);
    if (!character) continue;

    const imageUrl =
      character.imageKey === "default-hanzi" ? null : character.imageKey;
    if (imageUrl && !seenUrls.has(imageUrl)) {
      seenUrls.add(imageUrl);
      imageUrls.push(imageUrl);
    }

    for (const url of characterAudioUrls(character)) {
      if (seenUrls.has(url)) continue;
      seenUrls.add(url);
      audioUrls.push(url);
    }
  }

  return [...imageUrls, ...audioUrls];
}

export async function preloadHanziSessionAssets(
  session: HanziLearningSession,
  signal: AbortSignal,
): Promise<void> {
  const urls = collectHanziSessionAssetUrls(session);
  let cursor = 0;

  async function worker() {
    while (!signal.aborted) {
      const index = cursor;
      cursor += 1;
      const url = urls[index];
      if (!url) return;

      try {
        if (isAudioUrl(url)) {
          await preloadAudio(url, signal);
          continue;
        }
        const response = await fetch(url, {
          cache: "force-cache",
          credentials: "same-origin",
          signal,
        });
        if (!response.ok) {
          throw new Error(`Asset preload failed with ${response.status}`);
        }
        // Reading the body ensures Safari stores the complete response in its
        // HTTP cache instead of only retaining the response headers.
        await response.arrayBuffer();
      } catch (error) {
        if (signal.aborted) return;
        // A failed background preload must never block the learning flow.
        console.debug("Hanzi asset preload skipped", url, error);
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(MAX_BACKGROUND_REQUESTS, urls.length) },
      () => worker(),
    ),
  );
}
