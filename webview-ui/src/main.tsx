import { render } from "preact";
import { App } from "./App";
import { handleHostMessage } from "./state";
import { post } from "./vscodeApi";
import type { HostToWebview } from "../../src/panel/protocol";
import "./styles.css";
import "highlight.js/styles/github-dark.css";

window.addEventListener("message", (event: MessageEvent) => {
  handleHostMessage(event.data as HostToWebview);
});

render(<App />, document.getElementById("root")!);

post({ type: "ready" });
