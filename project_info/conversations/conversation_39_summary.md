The user requested to add a model selection feature, allowing users to choose between "gemini-2.5-pro" and "gemini-2.5-flash" for conversations, with "gemini-2.5-flash" hardcoded for summarization.

The AI proposed and implemented changes:
*   **Backend:** Modified `src/chat_utils.py` and `src/services.py` to accept and use a `model_name` parameter for chat sessions.
*   **State Management:** Added `model_name` to `AppState` in `ask.py` to store the user's selection.
*   **UI:** Implemented a dropdown menu in `ask.py` for model selection, including an event handler to update the application state and provide user feedback.