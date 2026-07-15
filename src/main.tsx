import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthApp } from "./components/AuthGate";
import { useRoute } from "./lib/router";
import "./index.css";

function Root() {
  const route = useRoute();
  const isPublic = route.view === "lookup" || route.view === "character";
  return (
    <AuthApp required={!isPublic}>
      <App />
    </AuthApp>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
