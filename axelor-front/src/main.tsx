import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Load dev tools in development mode
import "./utils/dev-tools";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
