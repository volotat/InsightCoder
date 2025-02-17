# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [v0.1.3] - 2025-02-18

### Added
- **Command-line option `--conversation-path` (or `-c`)** to `ask.py` for specifying a custom directory for conversation history, providing users with control over conversation storage location.
- **`.gitignore` handling for conversation folder:** Implemented logic to ensure conversation loading works correctly even when the conversation folder (default or custom) is ignored by Git, preserving conversation history while respecting `.gitignore` for codebase analysis.
- **Diff Detection in AI Responses:** Implemented logic in `diff_detector.py` to automatically detect code diff blocks within the AI's responses, identifying potential code modifications suggested by the AI.
- **File Path Extraction from Diff Blocks:** Enhanced diff detection to extract file paths from the headers of detected diff blocks, enabling identification of target files for code changes.
- **File Path Validation:** Implemented validation logic to check if extracted file paths from diff blocks correspond to existing files within the analyzed project, preventing application of diffs to invalid or non-existent files.
- **Unit Tests for Diff Detection:** Added comprehensive unit tests in `tests/test_diff_detector.py` for the `detect_diff_blocks` function, ensuring the robustness and correctness of diff detection and file path extraction logic.
- **Test for Conversation Folder Handling:** Added integration tests in `tests/test_conversation_folder.py` to verify correct conversation folder handling, including `.gitignore` scenarios and custom conversation paths.

### Changed
- Refactored `detect_diff_blocks` function in `diff_detector.py` to return a list of dictionaries, each containing diff block content and extracted file path, improving the structure of diff block information.
- Updated `ChatWorker` in `worker.py` to utilize the new `detect_diff_blocks` function for processing AI responses and logging detected diff blocks with file path information to the console.
- Modified `ask.py` and `ui.py` to accept and pass the `conversation_path` command-line argument, enabling users to specify custom conversation folders.
- Updated `ROADMAP.md` to reflect the implemented features and highlight next priorities, providing an up-to-date project development plan.

## [v0.1.2] - 2025-02-15

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