import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import douyaNeutral from "./assets/mascots/douya-neutral.png";
import douyaFocus from "./assets/mascots/douya-focus.png";
import douyaCelebrate from "./assets/mascots/douya-celebrate.png";
import paopaoNeutral from "./assets/mascots/paopao-neutral.png";
import paopaoFocus from "./assets/mascots/paopao-focus.png";
import paopaoCelebrate from "./assets/mascots/paopao-celebrate.png";
import tuantuanNeutral from "./assets/mascots/tuantuan-neutral.png";
import tuantuanFocus from "./assets/mascots/tuantuan-focus.png";
import tuantuanCelebrate from "./assets/mascots/tuantuan-celebrate.png";
import miluNeutral from "./assets/mascots/milu-neutral.png";
import miluFocus from "./assets/mascots/milu-focus.png";
import miluCelebrate from "./assets/mascots/milu-celebrate.png";
import shanshanNeutral from "./assets/mascots/shanshan-neutral.png";
import shanshanFocus from "./assets/mascots/shanshan-focus.png";
import shanshanCelebrate from "./assets/mascots/shanshan-celebrate.png";

export type PetType = "DOUYA" | "PAOPAO" | "TUANTUAN" | "MILU" | "SHANSHAN";
export type MascotMood = "neutral" | "focus" | "celebrate";

type MascotDefinition = {
  type: PetType;
  name: string;
  trait: string;
  tone: "leaf" | "sky" | "coral" | "lavender" | "gold";
  images: Record<MascotMood, string>;
  picker: {
    imageSize: number;
    imageOffsetX?: number;
    imageOffsetY?: number;
    figmaNode: string;
  };
};

export const MASCOTS: Record<PetType, MascotDefinition> = {
  DOUYA: {
    type: "DOUYA",
    name: "豆芽",
    trait: "生机勃勃",
    tone: "leaf",
    images: { neutral: douyaNeutral, focus: douyaFocus, celebrate: douyaCelebrate },
    picker: { imageSize: 173, figmaNode: "1:732" },
  },
  PAOPAO: {
    type: "PAOPAO",
    name: "泡泡",
    trait: "充满好奇",
    tone: "sky",
    images: { neutral: paopaoNeutral, focus: paopaoFocus, celebrate: paopaoCelebrate },
    picker: { imageSize: 164, figmaNode: "1:741" },
  },
  TUANTUAN: {
    type: "TUANTUAN",
    name: "团团",
    trait: "勇敢无畏",
    tone: "coral",
    images: { neutral: tuantuanNeutral, focus: tuantuanFocus, celebrate: tuantuanCelebrate },
    picker: { imageSize: 200, imageOffsetX: -7, imageOffsetY: 1.56, figmaNode: "1:750" },
  },
  MILU: {
    type: "MILU",
    name: "米露",
    trait: "聪明机智",
    tone: "lavender",
    images: { neutral: miluNeutral, focus: miluFocus, celebrate: miluCelebrate },
    picker: { imageSize: 190, imageOffsetX: -4.08, imageOffsetY: -5.01, figmaNode: "1:762" },
  },
  SHANSHAN: {
    type: "SHANSHAN",
    name: "闪闪",
    trait: "活泼可爱",
    tone: "gold",
    images: { neutral: shanshanNeutral, focus: shanshanFocus, celebrate: shanshanCelebrate },
    picker: { imageSize: 180, imageOffsetX: -6.68, imageOffsetY: -1.14, figmaNode: "1:771" },
  },
};

export const MASCOT_ORDER: PetType[] = [
  "DOUYA",
  "PAOPAO",
  "TUANTUAN",
  "MILU",
  "SHANSHAN",
];

type MascotContextValue = {
  selectedPet: PetType;
  mascot: MascotDefinition;
  selectPet: (pet: PetType) => void;
};

const MascotContext = createContext<MascotContextValue | null>(null);
const STORAGE_KEY = "star-monsters:selected-pet";

function initialPet(): PetType {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && stored in MASCOTS ? (stored as PetType) : "TUANTUAN";
}

export function MascotProvider({ children }: { children: ReactNode }) {
  const [selectedPet, setSelectedPet] = useState<PetType>(initialPet);

  const value = useMemo<MascotContextValue>(() => ({
    selectedPet,
    mascot: MASCOTS[selectedPet],
    selectPet: (pet) => {
      window.localStorage.setItem(STORAGE_KEY, pet);
      setSelectedPet(pet);
    },
  }), [selectedPet]);

  return <MascotContext.Provider value={value}>{children}</MascotContext.Provider>;
}

export function useMascot() {
  const context = useContext(MascotContext);
  if (!context) {
    throw new Error("useMascot 必须在 MascotProvider 内使用");
  }
  return context;
}
