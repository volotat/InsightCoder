# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


# [v0.1.2] - 2025-02-14

### Added
- Implemented background token counting using `TokenCountWorker` to prevent UI freezes during text input, ensuring a smoother user experience.
- Added `TokenCountSignals` for signal-based communication between the `TokenCountWorker` thread and the `MainWindow` UI thread, enabling thread-safe updates of the token count display.
- Introduced a visual **"Tokens: [count]" label** in the UI, positioned above the input text area, to display real-time token counts to the user.
- Implemented **debouncing for token count updates using `QTimer`**, reducing the frequency of token counting calculations and further improving UI responsiveness, especially during rapid typing.
- Added a **`ROADMAP.md` file** to the project root, outlining the project's short-term, medium-term, and long-term development vision and planned features.
- Included an **MIT License** to the project, adding a `LICENSE` file in the root directory and a "License" section to `README.md`, clarifying the open-source licensing terms.
- Added a **comparison table with GitHub Copilot to `README.md`**, highlighting the key differentiators and complementary nature of InsightCoder.
- Added a **"Beyond Code: Analyzing Any Git Repository" section to `README.md`**, emphasizing that InsightCoder can analyze any Git repository, including documentation, books, and other non-code projects.

### Changed
- Refactored token counting logic: Moved the token counting functionality from the `update_token_count_display` method in `MainWindow` (`ui.py`) into the dedicated `TokenCountWorker` class (`token_worker.py`), promoting code modularity and separation of concerns.
- Updated `ui.py` to utilize `TokenCountWorker` for asynchronous token counting, ensuring non-blocking UI operations.
- Modified `ui.py` to include new methods `start_token_count_timer` and `set_token_count_label` for managing the debounced token counting and updating the UI label via signals and slots.
- Improved UI responsiveness and smoothness during text input and token count updates by offloading the potentially time-consuming token counting process to a background thread, preventing UI freezes.
- Streamlined the **"Contributing" section in `README.md`** to be more concise and focused on bug reports, aligning with the project's current self-development stage.

### Fixed
- Resolved UI freezing issue that occurred during text input due to synchronous token counting in the main UI thread, significantly enhancing the user experience.


## [v0.1.1] - 2025-02-14

### Added
- Command-line argument `--project-path` (or `-p`) to `ask.py` for specifying the project directory to analyze.
- Documentation in `README.md` on how to use the `--project-path` argument.

### Changed
- Window title dynamically updates to display the name of the project directory being analyzed (e.g., "[Project Name] Codebase Chat").
- System prompt for the LLM is now more generic, focusing on codebase analysis rather than being specific to "InsightCoder" project identity.
- `MainWindow` in `ui.py` now accepts `project_path` as an argument for cleaner code and dynamic title setting.
- Updated `ask.py` and `chat_utils.py` to handle and pass the `project_path` argument correctly.

### Fixed
- Addressed the issue of the project analyzing only its own codebase by implementing `--project-path` functionality.
- Resolved the confusion of "InsightCoder" project identity when analyzing external codebases by making the system prompt and window title more context-aware.


## [v0.1.0] - 2025-02-14

This is the initial release of InsightCoder as a standalone open-source project, extracted from the Anagnorisis project.

### Added
- Initial codebase for InsightCoder, providing AI-powered codebase analysis.
- Interactive chat interface using PyQt5.
- Integration with Google Gemini API for natural language code queries.
- Markdown formatted output with syntax highlighting in responses.
- `requirements.txt` file for easy installation of dependencies.
- Basic `README.md` documentation to get users started.
- Saving conversation history to `.md` files.

### Changed
- Project renamed from internal tool to **InsightCoder** for open-source release.
- System prompt and UI updated to reflect the standalone InsightCoder identity.
- Conversation files are now saved in the `project_info/conversations` directory.

### Removed
- Grooveshark related notes from `README.md`.
- Anagnorisis specific branding and references throughout the codebase.