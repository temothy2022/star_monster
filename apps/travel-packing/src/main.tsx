import React from "react";
import ReactDOM from "react-dom/client";
import { TravelPackingList } from "./TravelPackingList";

function shareTokenFromLocation() {
  const hash = window.location.hash.match(/^#share\/([^/?#]+)$/)?.[1];
  if (!hash) return undefined;
  try { return decodeURIComponent(hash); } catch { return undefined; }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><TravelPackingList shareToken={shareTokenFromLocation()} /></React.StrictMode>,
);
