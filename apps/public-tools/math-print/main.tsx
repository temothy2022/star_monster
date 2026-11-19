import React from "react";
import ReactDOM from "react-dom/client";
import { MascotProvider } from "../../design-lab/src/mascots";
import { MathWorksheetPrintPage } from "../../design-lab/src/math-practice/MathWorksheetPrintPage";
import "./reset.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MascotProvider>
      <MathWorksheetPrintPage backHref="/" />
    </MascotProvider>
  </React.StrictMode>,
);
