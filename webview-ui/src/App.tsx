import { post } from "./vscodeApi";
import { canResend, contextInfo, errorMessage, initialized, turnState } from "./state";
import { ChatTabs } from "./components/ChatTabs";
import { InputBar } from "./components/InputBar";
import { MessageList } from "./components/MessageList";
import { Toolbar } from "./components/Toolbar";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function ErrorBanner() {
  if (!errorMessage.value) {
    return null;
  }
  return (
    <div class="banner error-banner">
      <span>{errorMessage.value}</span>
      <button onClick={() => (errorMessage.value = null)}>✕</button>
    </div>
  );
}

/** Size-guard confirm flow: shown when the assembled context exceeds the limit. */
function LargeContextBanner() {
  const warn = contextInfo.value?.warnTooLarge;
  if (!warn || turnState.value !== "assemblingContext") {
    return null;
  }
  return (
    <div class="banner warn-banner">
      <div>
        Estimated context is <b>{fmt(contextInfo.value!.estimatedTokens)}</b> tokens —
        above your limit of {fmt(warn.limit)}. Largest files:
      </div>
      <ul>
        {warn.largestFiles.slice(0, 10).map((f) => (
          <li key={f.path}>
            {f.path} ({f.kb} KB)
          </li>
        ))}
      </ul>
      <div class="banner-actions">
        <button onClick={() => post({ type: "confirmLargeContext", accept: true })}>
          Send anyway
        </button>
        <button class="danger" onClick={() => post({ type: "confirmLargeContext", accept: false })}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Shown when the last user message never received an answer (e.g. a stream error). */
function ResendBar() {
  if (!canResend.value || turnState.value !== "idle") {
    return null;
  }
  return (
    <div class="banner resend-banner">
      <span>Your last message wasn't answered.</span>
      <button onClick={() => post({ type: "resendLast" })}>Resend</button>
    </div>
  );
}

function StatusStrip() {
  const state = turnState.value;
  if (state === "idle") {
    return null;
  }
  const label =
    state === "assemblingContext"
      ? "Assembling project context…"
      : state === "streaming"
        ? "Generating…"
        : state === "saving"
          ? "Saving…"
          : "";
  return label ? <div class="status-strip">{label}</div> : null;
}

export function App() {
  if (!initialized.value) {
    return <div class="loading">Loading InsightCoder…</div>;
  }
  return (
    <div class="app">
      <Toolbar />
      <ErrorBanner />
      <ResendBar />
      <LargeContextBanner />
      <div class="main-area">
        <ChatTabs />
        <MessageList />
      </div>
      <StatusStrip />
      <InputBar />
    </div>
  );
}
