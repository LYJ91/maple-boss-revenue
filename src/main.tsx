import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useRoute } from "./lib/router";
import "./index.css";

const ProtectedApp = lazy(() =>
  import("./components/AuthGate").then((module) => ({
    default: module.ProtectedApp,
  })),
);

function Root() {
  const route = useRoute();
  const isPublic = route.view === "lookup" || route.view === "character";
  return isPublic ? (
    <App />
  ) : (
    <Suspense
      fallback={<div className="auth-screen">로그인 화면 불러오는 중…</div>}
    >
      <ProtectedApp>
        <App />
      </ProtectedApp>
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
