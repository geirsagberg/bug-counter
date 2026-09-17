import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LocalStorageBugRepository } from "./data/localStorageBugRepository";
import "./styles.css";

const repository = new LocalStorageBugRepository();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App repository={repository} />
  </StrictMode>,
);
