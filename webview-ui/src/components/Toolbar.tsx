import { post } from "../vscodeApi";
import {
  activeModel,
  contextInfo,
  models,
  showTabs,
  tokenCount,
  turnState,
} from "../state";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function Toolbar() {
  const busy = turnState.value !== "idle";

  const onModelChange = (e: Event) => {
    const value = (e.target as HTMLSelectElement).value;
    const [providerId, modelId] = value.split("|");
    activeModel.value = { providerId, modelId };
    post({ type: "selectModel", providerId, modelId });
  };

  const selected = `${activeModel.value.providerId}|${activeModel.value.modelId}`;
  const known = models.value.some(
    (m) => `${m.providerId}|${m.modelId}` === selected
  );

  return (
    <div class="toolbar">
      <button
        class={`icon-btn ${showTabs.value ? "toggled" : ""}`}
        title="Conversations"
        onClick={() => (showTabs.value = !showTabs.value)}
      >
        ☰
      </button>
      <select value={selected} onChange={onModelChange} title="Model" disabled={busy}>
        {!known && <option value={selected}>{activeModel.value.modelId}</option>}
        {models.value.map((m) => (
          <option key={`${m.providerId}|${m.modelId}`} value={`${m.providerId}|${m.modelId}`}>
            {m.label}
          </option>
        ))}
      </select>
      <button title="Reload project context" disabled={busy} onClick={() => post({ type: "reloadContext" })}>
        ⟳
      </button>
      <button title="Export conversation as Markdown" onClick={() => post({ type: "exportConversation" })}>
        ⇩
      </button>
      <button
        title="Open the full model context in an editor tab"
        onClick={() => post({ type: "showContext" })}
      >
        ⧉
      </button>
      <button
        title="Inspect context files by size and exclude large ones"
        onClick={() => post({ type: "inspectContext" })}
      >
        📊
      </button>
      <div class="toolbar-spacer" />
      <span
        class="status-line"
        title="Input tokens that will be sent with the next message (codebase context + conversation history + draft). ~ means estimated."
      >
        {contextInfo.value && `${fmt(contextInfo.value.fileCount)} files · `}
        {tokenCount.value &&
          `Input: ${tokenCount.value.exact ? "" : "~"}${fmt(tokenCount.value.total)} tokens`}
      </span>
    </div>
  );
}
