

**User:**

based on the change history let's create a changelog entry for latest changes.



**Model:**

Of course. Based on the recent refactoring of the project structure, here is a new changelog entry for version `v0.2.1`.

### How to Update Your `CHANGELOG.md`

1.  Open the `InsightCoder/CHANGELOG.md` file.
2.  Copy the entire Markdown block below.
3.  Paste it at the top of the file, just below the main header.

---

### Suggested Changelog Entry

```markdown
## [v0.2.1] - 2025-08-18

### Changed
- **Project Structure Refactoring:** Reorganized the project's file structure to improve clarity and maintainability.
    - The legacy `ask_src` directory has been removed.
    - All backend modules (`services.py`, `chat_utils.py`) have been consolidated into a new, cleaner `src` directory.
    - The main application entry point was renamed from `flet_ask.py` to `ask.py`, simplifying the project's root.
    - All internal imports were updated to reflect the new file paths.
```



**User:**

You forget to mention the quality of life improvements



**Model:**

You are absolutely right. My apologies for overlooking those important additions. The refactoring was done in conjunction with several quality-of-life improvements that should definitely be included.

Thank you for the correction. Here is the revised and more comprehensive changelog entry for `v0.2.1` that includes these enhancements.

---

### Suggested Changelog Entry

```markdown
## [v0.2.1] - 2025-08-18

### Added
- **Model Selector:** Implemented a dropdown menu in the UI, allowing users to choose between `gemini-2.5-pro` and `gemini-2.5-flash` models for their conversation.
- **Selectable Chat Text:** All chat messages, including the welcome screen, are now selectable, making it easy to copy code snippets and responses.
- **Enhanced Welcome Message:** The initial welcome screen now includes a more detailed message with a privacy notice and clearer getting-started instructions.

### Changed
- **Project Structure Refactoring:** Reorganized the project's file structure to improve clarity and maintainability.
    - The legacy `ask_src` directory has been removed.
    - All backend modules (`services.py`, `chat_utils.py`) have been consolidated into a new, cleaner `src` directory.
    - The main application entry point was renamed from `flet_ask.py` to `ask.py`, simplifying the project's root.
    - All internal imports were updated to reflect the new file paths.

### Fixed
- **UI Responsiveness:** Resolved an issue where the UI would freeze for a moment when a message was sent. The application now yields to the UI thread to render the user's message before making the blocking API call.
```

