Here's a summary of the conversation:

*   **User Requirement:** The application should summarize all existing, unsummarized conversation history files on startup before initializing the main chat session and loading the codebase context.
*   **AI Solution & Key Modifications:**
    *   Modify `ask.py` to detect unsummarized conversation files (`conversation_N.md` without `_summary.md`).
    *   Load the content of these old conversations.
    *   Start background `SummaryWorker` threads for each unsummarized file.
    *   Block the main thread using `worker.join()` for all startup workers, ensuring summarization completes before proceeding.
    *   Refactor `chat_utils.py` to configure the API client independently early in `ask.py` so it can be passed to both the startup workers and the main chat session setup.
    *   Add a helper function (`reconstruct_markdown_history`) to convert the loaded conversation data format into the full markdown text needed by the summarization worker.
    *   Provided detailed code changes for `ask.py` and `chat_utils.py` to implement this logic.