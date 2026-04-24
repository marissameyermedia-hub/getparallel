import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { DevGallery } from "./dev/DevGallery";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const isDevGallery = params.get("dev") === "1";

createRoot(document.getElementById("root")!).render(isDevGallery ? <DevGallery /> : <App />);
