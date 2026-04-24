import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { DevGallery } from "./dev/DevGallery";
import "./index.css";

// DevGallery is mounted whenever ?dev=1 is set OR when ?d=<screen-id> is
// present (so a deep-link URL alone is enough to enter gallery mode).
const params = new URLSearchParams(window.location.search);
const isDevGallery = params.get("dev") === "1" || params.has("d");

createRoot(document.getElementById("root")!).render(isDevGallery ? <DevGallery /> : <App />);
