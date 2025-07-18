The user requested a summary of current codebase changes for a changelog. The AI provided a detailed changelog entry, highlighting two key additions and two significant changes:

*   **Added:** A "Reload Context" button and `ContextReloadWorker` for on-demand codebase re-scanning, and a Welcome Screen with initial user guidance.
*   **Changed:** Replaced `QTextBrowser` with `QWebEngineView` for chat rendering to improve Markdown and code block display quality, requiring refactoring of UI logic in `ask_src/ui.py`.