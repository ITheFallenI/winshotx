import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PinWindow } from "./components/pin/PinWindow";
import "./styles.css";
import "./lib/sinMenuDelNavegador";

const imagen = new URLSearchParams(window.location.search).get("imagen") ?? "";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PinWindow imagen={imagen} />
  </StrictMode>,
);
