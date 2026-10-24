import { createRoot } from "react-dom/client";
import { GalleryApp } from "./components/gallery/GalleryApp";
import "./styles.css";
import "./lib/sinMenuDelNavegador";
createRoot(document.getElementById("root")!).render(<GalleryApp />);
