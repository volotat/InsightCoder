import { useRef } from "preact/hooks";
import { post } from "../vscodeApi";
import { hasApiKey, turns, turnState } from "../state";

export function InputBar() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = turnState.value !== "idle";

  const send = () => {
    const el = textareaRef.current;
    if (!el || busy) {
      return;
    }
    const text = el.value.trim();
    if (!text) {
      return;
    }
    turns.value = [
      ...turns.value,
      { role: "user", content: text, timestamp: new Date().toISOString() },
    ];
    post({ type: "sendMessage", text });
    el.value = "";
    post({ type: "draftChanged", text: "" });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!hasApiKey.value) {
    return (
      <div class="input-bar no-key">
        <span>No API key configured for the active provider.</span>
        <button onClick={() => post({ type: "setApiKey" })}>Set API Key…</button>
      </div>
    );
  }

  return (
    <div class="input-bar">
      <textarea
        ref={textareaRef}
        rows={3}
        placeholder="Ask about this codebase… (Enter to send, Shift+Enter for a new line)"
        disabled={busy}
        onKeyDown={onKeyDown}
        onInput={(e) =>
          post({ type: "draftChanged", text: (e.target as HTMLTextAreaElement).value })
        }
      />
      {busy ? (
        <button class="danger" onClick={() => post({ type: "cancelStream" })}>
          Stop
        </button>
      ) : (
        <button onClick={send}>Send</button>
      )}
    </div>
  );
}
