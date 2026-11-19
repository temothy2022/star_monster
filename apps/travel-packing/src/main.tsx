import React from "react";
import ReactDOM from "react-dom/client";
import { TravelPackingList } from "./TravelPackingList";

function shareTokenFromLocation() {
  const hash = window.location.hash.match(/^#share\/([^/?#]+)$/)?.[1];
  if (!hash) return undefined;
  try { return decodeURIComponent(hash); } catch { return undefined; }
}

const shareToken = shareTokenFromLocation();
const shareOnly = import.meta.env.BASE_URL === "/packing-share/";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{shareOnly && !shareToken
    ? <main style={{ fontFamily: "sans-serif", padding: "4rem 2rem", textAlign: "center" }}>分享链接无效</main>
    : <TravelPackingList shareToken={shareToken} />}</React.StrictMode>,
);
