This conversation details the implementation of a feature to manage LLM context by summarizing past conversations.

Key points:
*   **User Goal:** Implement automatic summarization of user-AI conversations and use only these summaries (instead of full chat history) as context for future interactions.
*   **AI's Solution:** Proposed a plan involving a background worker (`SummaryWorker`) to generate summaries asynchronously.
*   **Code Changes:** Modifications were made across `ask_src/chat_utils.py` (summarization function, context loading from summaries), `ask_src/worker.py` (new `SummaryWorker` thread), `ask_src/ui.py` (triggering summarization on save, updating conversation counter logic), and `ask.py` (handling conversation path, passing necessary objects).
*   **Outcome:** The system now saves full conversations, generates summaries in the background, includes only summaries in the LLM's context, and excludes the conversation directory from the general codebase context.