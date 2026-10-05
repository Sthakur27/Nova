import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/400-italic.css";
import { createRoot } from "react-dom/client";
import WebApp from "./WebApp";
import "../style.css";
import "./web.css";

createRoot(document.getElementById("root")!).render(<WebApp />);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Note storage still works. Show that offline shell installation failed.
      const message = document.createElement("p");
      message.className = "web-offline-warning";
      message.setAttribute("role", "status");
      message.textContent = "Offline launch is not ready. Keep Nova open while editing offline, and reload once online to retry.";
      document.body.append(message);
    });
  });
}
