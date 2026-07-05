import { post } from "../vscodeApi";
import { activeConversationId, conversations, showTabs } from "../state";

export function ChatTabs() {
  if (!showTabs.value) {
    return null;
  }
  return (
    <div class="chat-tabs">
      <div class="chat-tabs-header">
        <span>Conversations</span>
        <button onClick={() => post({ type: "newConversation" })}>＋ New</button>
      </div>
      {conversations.value.length === 0 && <div class="chat-tabs-empty">No conversations yet.</div>}
      {conversations.value.map((c) => (
        <div
          key={c.id}
          class={`chat-tab ${c.id === activeConversationId.value ? "active" : ""}`}
          onClick={() => post({ type: "switchConversation", id: c.id })}
        >
          <div class="chat-tab-title" title={c.title}>
            {c.title}
          </div>
          <div class="chat-tab-meta">
            {new Date(c.updatedAt).toLocaleDateString()} · {c.turnCount} turns
            <button
              class="chat-tab-delete"
              title="Delete conversation"
              onClick={(e) => {
                e.stopPropagation();
                post({ type: "deleteConversation", id: c.id });
              }}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
