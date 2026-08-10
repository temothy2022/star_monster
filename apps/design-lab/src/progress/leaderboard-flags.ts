import chinaFlag from "@star-monsters/assets/images/footprints/flags/china.webp?no-inline";
import japanFlag from "@star-monsters/assets/images/footprints/flags/japan.webp?no-inline";
import koreaFlag from "@star-monsters/assets/images/footprints/flags/korea.webp?no-inline";
import singaporeFlag from "@star-monsters/assets/images/footprints/flags/singapore.webp?no-inline";
import unitedKingdomFlag from "@star-monsters/assets/images/footprints/flags/united-kingdom.webp?no-inline";
import franceFlag from "@star-monsters/assets/images/footprints/flags/france.webp?no-inline";
import germanyFlag from "@star-monsters/assets/images/footprints/flags/germany.webp?no-inline";
import italyFlag from "@star-monsters/assets/images/footprints/flags/italy.webp?no-inline";
import canadaFlag from "@star-monsters/assets/images/footprints/flags/canada.webp?no-inline";
import australiaFlag from "@star-monsters/assets/images/footprints/flags/australia.webp?no-inline";
import brazilFlag from "@star-monsters/assets/images/footprints/flags/brazil.webp?no-inline";
import unitedStatesFlag from "@star-monsters/assets/images/footprints/flags/united-states.webp?no-inline";
import type { ChildLeaderboardEntry } from "../api/child-api";

export const LEADERBOARD_FLAGS: Record<ChildLeaderboardEntry["flagKey"], string> = {
  CHINA: chinaFlag,
  JAPAN: japanFlag,
  KOREA: koreaFlag,
  SINGAPORE: singaporeFlag,
  UNITED_KINGDOM: unitedKingdomFlag,
  FRANCE: franceFlag,
  GERMANY: germanyFlag,
  ITALY: italyFlag,
  CANADA: canadaFlag,
  AUSTRALIA: australiaFlag,
  BRAZIL: brazilFlag,
  UNITED_STATES: unitedStatesFlag,
};
