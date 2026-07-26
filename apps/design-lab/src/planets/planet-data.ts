import earth from "../assets/planets/earth.webp";
import jupiter from "../assets/planets/jupiter.webp";
import mars from "../assets/planets/mars.webp";
import mercury from "../assets/planets/mercury.webp";
import neptune from "../assets/planets/neptune.webp";
import saturn from "../assets/planets/saturn.webp";
import uranus from "../assets/planets/uranus.webp";
import venus from "../assets/planets/venus.webp";

export const PLANET_KEYS = [
  "MERCURY",
  "VENUS",
  "EARTH",
  "MARS",
  "JUPITER",
  "SATURN",
  "URANUS",
  "NEPTUNE",
] as const;

export type PlanetKey = (typeof PLANET_KEYS)[number];

export type PlanetPresentation = {
  key: PlanetKey;
  name: string;
  englishName: string;
  image: string;
  description: string;
  discovery: string;
};

export const PLANETS: PlanetPresentation[] = [
  {
    key: "MERCURY",
    name: "水星",
    englishName: "Mercury",
    image: mercury,
    description: "离太阳最近的星球，布满了亮闪闪的环形山。",
    discovery: "水星的一天非常漫长。你每完成一个小任务，就像为它添上一束温暖的阳光。",
  },
  {
    key: "VENUS",
    name: "金星",
    englishName: "Venus",
    image: venus,
    description: "被金色云层包裹，是夜空中格外明亮的邻居。",
    discovery: "金星藏在厚厚的云朵下面。耐心和坚持，会帮助小小探险家看见更多秘密。",
  },
  {
    key: "EARTH",
    name: "地球",
    englishName: "Earth",
    image: earth,
    description: "蓝色海洋与绿色大陆组成了我们共同的家。",
    discovery: "地球上有山川、海洋和无数生命。照顾自己、帮助家人，也是在守护这颗蓝色星球。",
  },
  {
    key: "MARS",
    name: "火星",
    englishName: "Mars",
    image: mars,
    description: "红色沙漠、高山与峡谷，等待勇敢的脚印。",
    discovery: "火星拥有太阳系中很高的山。一次次勇敢尝试，会带你攀上自己的新高峰。",
  },
  {
    key: "JUPITER",
    name: "木星",
    englishName: "Jupiter",
    image: jupiter,
    description: "太阳系最大的星球，还有一场巨大的红色风暴。",
    discovery: "木星像一位强壮的守护者。把大目标分成小步骤，你也能积攒强大的力量。",
  },
  {
    key: "SATURN",
    name: "土星",
    englishName: "Saturn",
    image: saturn,
    description: "冰块和岩石组成的光环，让它格外耀眼。",
    discovery: "土星的光环由许多小碎片组成。许多个认真完成的小任务，也会汇成漂亮的大成果。",
  },
  {
    key: "URANUS",
    name: "天王星",
    englishName: "Uranus",
    image: uranus,
    description: "侧着身子绕太阳旅行，是一颗青蓝色的冰巨星。",
    discovery: "天王星用特别的姿势前进。找到适合自己的方法，同样可以稳稳抵达目的地。",
  },
  {
    key: "NEPTUNE",
    name: "海王星",
    englishName: "Neptune",
    image: neptune,
    description: "遥远而深蓝，拥有太阳系里速度惊人的风。",
    discovery: "海王星是这段航程中遥远的一站。走到这里，说明你的坚持已经闪闪发光。",
  },
];

export const PLANET_BY_KEY = Object.fromEntries(
  PLANETS.map((planet) => [planet.key, planet]),
) as Record<PlanetKey, PlanetPresentation>;
