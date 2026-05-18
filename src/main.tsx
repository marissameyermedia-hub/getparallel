import { createRoot } from "react-dom/client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import App from "./App.tsx";
import { DevGallery } from "./dev/DevGallery";
import { initOneSignal } from "./utils/onesignal";
import "./index.css";

const params = new URLSearchParams(window.location.search);
const isDevGallery = params.get("dev") === "1" || params.has("d");

if (!isDevGallery) {
  const script = document.createElement("script");
  script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
  script.defer = true;
  document.head.appendChild(script);
  script.onload = () => initOneSignal();
}

const phKey = import.meta.env.VITE_POSTHOG_API_KEY as string | undefined;
const phHost =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

if (phKey) {
  posthog.init(phKey, {
    api_host: phHost,
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
  });
}

const root = createRoot(document.getElementById("root")!);

root.render(
  phKey ? (
    <PostHogProvider client={posthog}>
      {isDevGallery ? <DevGallery /> : <App />}
    </PostHogProvider>
  ) : isDevGallery ? (
    <DevGallery />
  ) : (
    <App />
  )
);
