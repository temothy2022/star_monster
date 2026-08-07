import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import douyaNeutral from "@star-monsters/assets/images/mascots/douya-neutral.webp";
import douyaFocus from "@star-monsters/assets/images/mascots/douya-focus.webp";
import douyaCelebrate from "@star-monsters/assets/images/mascots/douya-celebrate.webp";
import paopaoNeutral from "@star-monsters/assets/images/mascots/paopao-neutral.webp";
import paopaoFocus from "@star-monsters/assets/images/mascots/paopao-focus.webp";
import paopaoCelebrate from "@star-monsters/assets/images/mascots/paopao-celebrate.webp";
import tuantuanNeutral from "@star-monsters/assets/images/mascots/tuantuan-neutral.webp";
import tuantuanFocus from "@star-monsters/assets/images/mascots/tuantuan-focus.webp";
import tuantuanCelebrate from "@star-monsters/assets/images/mascots/tuantuan-celebrate.webp";
import miluNeutral from "@star-monsters/assets/images/mascots/milu-neutral.webp";
import miluFocus from "@star-monsters/assets/images/mascots/milu-focus.webp";
import miluCelebrate from "@star-monsters/assets/images/mascots/milu-celebrate.webp";
import miluTaskIdle from "@star-monsters/assets/images/mascots/animations/milu-task-idle.webp";
import shanshanNeutral from "@star-monsters/assets/images/mascots/shanshan-neutral.webp";
import shanshanFocus from "@star-monsters/assets/images/mascots/shanshan-focus.webp";
import shanshanCelebrate from "@star-monsters/assets/images/mascots/shanshan-celebrate.webp";
import douyaHungry from "@star-monsters/assets/images/mascots/states/douya-hungry.webp";
import douyaEating from "@star-monsters/assets/images/mascots/states/douya-eating.webp";
import douyaDrinking from "@star-monsters/assets/images/mascots/states/douya-drinking.webp";
import douyaTravel from "@star-monsters/assets/images/mascots/states/douya-travel.webp";
import douyaSleeping from "@star-monsters/assets/images/mascots/states/douya-sleeping.webp";
import paopaoHungry from "@star-monsters/assets/images/mascots/states/paopao-hungry.webp";
import paopaoEating from "@star-monsters/assets/images/mascots/states/paopao-eating.webp";
import paopaoDrinking from "@star-monsters/assets/images/mascots/states/paopao-drinking.webp";
import paopaoTravel from "@star-monsters/assets/images/mascots/states/paopao-travel.webp";
import paopaoSleeping from "@star-monsters/assets/images/mascots/states/paopao-sleeping.webp";
import tuantuanHungry from "@star-monsters/assets/images/mascots/states/tuantuan-hungry.webp";
import tuantuanEating from "@star-monsters/assets/images/mascots/states/tuantuan-eating.webp";
import tuantuanDrinking from "@star-monsters/assets/images/mascots/states/tuantuan-drinking.webp";
import tuantuanTravel from "@star-monsters/assets/images/mascots/states/tuantuan-travel.webp";
import tuantuanSleeping from "@star-monsters/assets/images/mascots/states/tuantuan-sleeping.webp";
import miluHungry from "@star-monsters/assets/images/mascots/states/milu-hungry.webp";
import miluEating from "@star-monsters/assets/images/mascots/states/milu-eating.webp";
import miluDrinking from "@star-monsters/assets/images/mascots/states/milu-drinking.webp";
import miluTravel from "@star-monsters/assets/images/mascots/states/milu-travel.webp";
import miluSleeping from "@star-monsters/assets/images/mascots/states/milu-sleeping.webp";
import shanshanHungry from "@star-monsters/assets/images/mascots/states/shanshan-hungry.webp";
import shanshanEating from "@star-monsters/assets/images/mascots/states/shanshan-eating.webp";
import shanshanDrinking from "@star-monsters/assets/images/mascots/states/shanshan-drinking.webp";
import shanshanTravel from "@star-monsters/assets/images/mascots/states/shanshan-travel.webp";
import shanshanSleeping from "@star-monsters/assets/images/mascots/states/shanshan-sleeping.webp";

export type PetType = "DOUYA" | "PAOPAO" | "TUANTUAN" | "MILU" | "SHANSHAN";
export type MascotMood = "neutral" | "focus" | "celebrate";
export type MascotActivity = "hungry" | "eating" | "drinking" | "travel" | "sleeping";

type MascotDefinition = {
  type: PetType;
  name: string;
  trait: string;
  tone: "leaf" | "sky" | "coral" | "lavender" | "gold";
  images: Record<MascotMood, string>;
  activityImages: Record<MascotActivity, string>;
  taskImage?: string;
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
    activityImages: { hungry: douyaHungry, eating: douyaEating, drinking: douyaDrinking, travel: douyaTravel, sleeping: douyaSleeping },
    picker: { imageSize: 173, figmaNode: "1:732" },
  },
  PAOPAO: {
    type: "PAOPAO",
    name: "泡泡",
    trait: "充满好奇",
    tone: "sky",
    images: { neutral: paopaoNeutral, focus: paopaoFocus, celebrate: paopaoCelebrate },
    activityImages: { hungry: paopaoHungry, eating: paopaoEating, drinking: paopaoDrinking, travel: paopaoTravel, sleeping: paopaoSleeping },
    picker: { imageSize: 164, figmaNode: "1:741" },
  },
  TUANTUAN: {
    type: "TUANTUAN",
    name: "团团",
    trait: "勇敢无畏",
    tone: "coral",
    images: { neutral: tuantuanNeutral, focus: tuantuanFocus, celebrate: tuantuanCelebrate },
    activityImages: { hungry: tuantuanHungry, eating: tuantuanEating, drinking: tuantuanDrinking, travel: tuantuanTravel, sleeping: tuantuanSleeping },
    picker: { imageSize: 200, imageOffsetX: -7, imageOffsetY: 1.56, figmaNode: "1:750" },
  },
  MILU: {
    type: "MILU",
    name: "米露",
    trait: "聪明机智",
    tone: "lavender",
    images: { neutral: miluNeutral, focus: miluFocus, celebrate: miluCelebrate },
    activityImages: { hungry: miluHungry, eating: miluEating, drinking: miluDrinking, travel: miluTravel, sleeping: miluSleeping },
    taskImage: miluTaskIdle,
    picker: { imageSize: 190, imageOffsetX: -4.08, imageOffsetY: -5.01, figmaNode: "1:762" },
  },
  SHANSHAN: {
    type: "SHANSHAN",
    name: "闪闪",
    trait: "活泼可爱",
    tone: "gold",
    images: { neutral: shanshanNeutral, focus: shanshanFocus, celebrate: shanshanCelebrate },
    activityImages: { hungry: shanshanHungry, eating: shanshanEating, drinking: shanshanDrinking, travel: shanshanTravel, sleeping: shanshanSleeping },
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
