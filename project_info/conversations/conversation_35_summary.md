The user requested a "Reload Context" button to update the codebase understanding for the AI model while preserving the ongoing conversation.

The AI proposed a solution involving:
*   **UI Addition:** A "Reload Context" button next to the "Send" button.
*   **Background Processing:** A new `ContextReloadWorker` to re-analyze the project and generate an updated system prompt without freezing the UI.
*   **Session Management:** Creation of a *new* chat session instance with the updated context, crucially preserving the *entire history* from the current conversation.
*   **UI Update:** Swapping the old chat session with the new, updated one, allowing the user to continue the conversation with the AI's refreshed knowledge.

Code modifications were provided for `ask_src/worker.py` (adding the `ContextReloadWorker` and a `context_reloaded` signal) and `ask_src/ui.py` (integrating the button, its click handler, and a slot to receive the new chat session).