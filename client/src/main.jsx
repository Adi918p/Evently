import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import "./styles/global.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      {/* AuthProvider needs the router (it navigates on sign-out), and toasts
          need to be available to everything below. */}
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
