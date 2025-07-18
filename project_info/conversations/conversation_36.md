

**User:**

Summarize current changes for the changelog



**Model:**

Of course. Based on the uncommitted changes, here is a summary for the changelog.

### Changelog Summary

Here is a summary of the recent changes, formatted for a `CHANGELOG.md` file.

```markdown
### Added
- **"Reload Context" Button:** Introduced a "Reload Context" button in the UI. This allows users to re-scan the project's codebase on demand, updating the AI's knowledge with the latest file changes without losing the current conversation history.
- **`ContextReloadWorker`:** Implemented a new background worker in `ask_src/worker.py` to handle the context reloading process asynchronously. This ensures the UI remains responsive while a new chat session is prepared with the updated context and existing conversation history.
- **Welcome Screen:** Added an initial welcome message that is displayed on application startup. It provides guidance and example prompts for new users and is replaced by the conversation once the first message is sent.

### Changed
- **Chat Rendering Engine:** Replaced the `QTextBrowser` widget with `QWebEngineView` for displaying chat messages. This change significantly improves the rendering quality and accuracy of Markdown and syntax-highlighted code blocks by leveraging a full web engine.
- **UI Logic:** Refactored `ask_src/ui.py` to support `QWebEngineView`, which involved embedding styled content within a full HTML structure and handling UI interactions like scrolling via JavaScript.
```

