import { useRef } from "react";
import { AdventureButton, StarPetCard } from "@star-monsters/ui";
import arrowLeft from "@star-monsters/assets/icons/icon-arrow-left.svg";
import check from "@star-monsters/assets/icons/icon-check.svg";
import rocket from "@star-monsters/assets/icons/icon-rocket.svg";
import { MASCOTS, MASCOT_ORDER, type PetType } from "../mascots";
import { OnboardingViewport } from "./OnboardingViewport";

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

const pets = MASCOT_ORDER.map((type) => {
  const mascot = MASCOTS[type];
  return {
    type,
    name: mascot.name,
    trait: mascot.trait,
    image: mascot.images.neutral,
    tone: mascot.tone,
    ...mascot.picker,
  };
});

interface OnboardingStep1Props {
  selectedPet: PetType;
  onSelectPet: (pet: PetType) => void;
  onNext: () => void;
}

export function OnboardingStep1({
  selectedPet,
  onSelectPet,
  onNext
}: OnboardingStep1Props) {
  const audioContextRef = useRef<AudioContext | null>(null);

  function playSelectionChime() {
    if (typeof window === "undefined") return;

    const AudioContextConstructor =
      window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;

    if (!AudioContextConstructor) return;

    const audioContext =
      audioContextRef.current?.state === "closed"
        ? new AudioContextConstructor()
        : (audioContextRef.current ?? new AudioContextConstructor());

    audioContextRef.current = audioContext;

    const startChime = () => {
      const startTime = audioContext.currentTime;
      const notes = [659.25, 830.61, 1046.5];

      notes.forEach((frequency, index) => {
        const noteStart = startTime + index * 0.06;
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = index === 2 ? "sine" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, noteStart);
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.045, noteStart + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.22);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.24);
      });
    };

    if (audioContext.state === "suspended") {
      void audioContext.resume().then(startChime).catch(() => undefined);
      return;
    }

    startChime();
  }

  function selectPet(pet: PetType) {
    if (pet === selectedPet) return;
    onSelectPet(pet);
    playSelectionChime();
  }

  return (
    <OnboardingViewport
      className="onboarding-canvas"
      designWidth={1282}
      referenceNode="1:724"
    >
        <header className="onboarding-heading" data-figma-node="1:726">
          <h1>选择你的星际伙伴</h1>
          <p>谁将陪你一起探索星辰大海？</p>
        </header>

        <section
          className="pet-picker"
          aria-label="选择星际伙伴"
          role="radiogroup"
          data-figma-node="1:731"
        >
          {pets.map((pet) => (
            <StarPetCard
              key={pet.type}
              {...pet}
              imageAlt={`${pet.name}星宠`}
              selected={pet.type === selectedPet}
              selectedIcon={check}
              onSelect={() => selectPet(pet.type)}
            />
          ))}
        </section>

        <nav className="onboarding-actions" aria-label="首次使用导航" data-figma-node="1:782">
          <AdventureButton
            variant="secondary"
            className="onboarding-action onboarding-action--back"
            aria-label="返回（当前为首次使用起点）"
          >
            <img src={arrowLeft} alt="" />
            返回
          </AdventureButton>
          <AdventureButton
            className="onboarding-action onboarding-action--launch"
            onClick={onNext}
          >
            出发吧！
            <img src={rocket} alt="" />
          </AdventureButton>
        </nav>
    </OnboardingViewport>
  );
}
