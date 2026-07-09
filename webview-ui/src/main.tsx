import { render } from "preact";
import { App } from "./App";
import { handleHostMessage, hydrateFromSnapshot } from "./state";
import { loadUiState, post } from "./vscodeApi";
import type { HostToWebview } from "../../src/panel/protocol";
import "./styles.css";
import "highlight.js/styles/github-dark.css";

window.addEventListener("message", (event: MessageEvent) => {
  handleHostMessage(event.data as HostToWebview);
});

// Paint the last-known chat instantly on reload; the host's `init` reply
// (triggered by `ready` below) then overwrites with authoritative state.
const snapshot = loadUiState();
if (snapshot) {
  hydrateFromSnapshot(snapshot);
}

render(<App />, document.getElementById("root")!);

post({ type: "ready" });
