import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { DevGallery } from "./dev/DevGallery";
import { initOneSignal } from "./utils/onesignal";
import "./index.css";

// DevGallery is mounted whenever ?dev=1 is set OR when ?d=<screen-id> is
// present (so a deep-link URL alone is enough to enter gallery mode).
const params = new URLSearchParams(window.location.search);
const isDevGallery = params.get("dev") === "1" || params.has("d");

// Inject the OneSignal SDK script dynamically so it loads async without
// blocking the React bundle. Only load in production (not dev gallery).
if (!isDevGallery) {
  const script = document.createElement("script");
  script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  script.defer = true;
  document.head.appendChild(script);

  // Initialize OneSignal after the script is ready
  script.onload = () => initOneSignal();
}

createRoot(document.getElementById("root")!).render(
  isDevGallery ? <DevGallery /> : <App />
);
