The user reported issues with code highlighting (improper highlighting, splitting into non-code sections) and suspected the `markdown.markdown` method with internal JS processing might be a more robust solution.

The AI confirmed this, stating that relying on Python's `Pygments` for static HTML highlighting is brittle. The proposed solution is to delegate syntax highlighting to a client-side JavaScript library, `highlight.js`, within the `QWebEngineView`.

Key steps suggested by the AI:
*   **Add `highlight.js` assets** (JS and CSS theme) to the project.
*   **Remove `Pygments`** dependency and its obsolete CSS file.
*   **Refactor `ui.py` and `worker.py`** to stop using the `codehilite` extension in `markdown.markdown` calls, and instead load `highlight.js` and its CSS, then execute `hljs.highlightAll()` in the `QWebEngineView`.