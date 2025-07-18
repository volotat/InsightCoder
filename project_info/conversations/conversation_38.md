

**User:**

Summarize current changes for the changelog



**Model:**

Of course. Based on the recent changes in your codebase, here is a summary for your changelog.

### Summary of Changes

The core of the recent updates has been a complete overhaul of the syntax highlighting system for code blocks in the chat view.

*   **From Server-Side to Client-Side:** The application has moved away from using the Python `Pygments` library (server-side highlighting) and now uses the JavaScript library `highlight.js` (client-side highlighting).
*   **Improved Rendering:** This change leverages the power of `QWebEngineView` to delegate syntax highlighting to a robust, specialized JavaScript library. This results in more accurate, reliable, and visually appealing rendering of code blocks, fixing issues with incorrect highlighting and formatting.
*   **Dependency Cleanup:** As a result, the `Pygments` dependency has been removed from `requirements.txt`, and the associated CSS file (`pygments_default.css`) has been deleted. The new system relies on `highlight.js` assets (JS and CSS) loaded directly by the web view.

Here is the formatted changelog entry for you to add to `CHANGELOG.md`:

```markdown
## [v0.1.7] - 2025-07-19

### Changed
- **Syntax Highlighting Engine:** Replaced the server-side `Pygments` library with the client-side `highlight.js` library for rendering syntax-highlighted code blocks. This change leverages `QWebEngineView` to delegate highlighting to JavaScript, resulting in significantly more robust and accurate code formatting in the chat display.
- **UI Rendering Logic:** Refactored `ask_src/ui.py` and `ask_src/worker.py` to remove the `codehilite` Markdown extension and instead load `highlight.js` assets and trigger the highlighting script within the `QWebEngineView`.

### Removed
- **`Pygments` Dependency:** Removed `Pygments` from `requirements.txt` and deleted the obsolete `pygments_default.css` file, simplifying the project's dependencies.
```

