# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [v0.3.1] - 2026-07-06

### Added
- **Reasoning traces.** When a model exposes its thinking, it is shown in a collapsible block that is hidden by default. While the model is thinking, an animated indicator makes the process clearly visible and a continuously updating count shows how many tokens are being spent on reasoning; the completed trace stays available to expand. Supports Gemini thoughts and MiniMax M-series inline `<think>…</think>` reasoning.
- **Resend unanswered messages.** If a message fails to reach the model (network error, missing API key, etc.), the unanswered message can be resent with one click instead of being retyped.
- **Context visibility in the Explorer.** Files included in the current model context are marked with a check badge; files that were scanned but skipped get a minus badge with the reason. Unmarked files are not part of the context.
- **Open the full assembled context** in an editor tab from a toolbar button in the chat panel (in addition to the existing `InsightCoder: Show Assembled Context` command).
- **Upfront input token count.** The panel shows how many input tokens the next message will cost before anything is sent (exact on Gemini, estimated on MiniMax), updating live as you type and after each turn.

### Changed
- **Default Gemini models updated** to `gemini-3.5-flash` and `gemini-3.5-pro`.
- **Summaries exclude reasoning traces** — thinking is stripped from generated summaries so it is never stored as long-term memory.

### Fixed
- MiniMax M-series reasoning was rendered as plain answer text with no way to hide it; its inline `<think>…</think>` reasoning is now parsed out of the response stream (handling tags split across chunks) and routed to the collapsible thinking block.
- Reasoning no longer disappeared on follow-up turns: continuation responses whose chat template auto-prefills the opening `<think>` (so only a closing `</think>` is streamed) are now detected and routed to the thinking block instead of leaking into the answer.

## [v0.3.0] - 2026-07-06

### Changed
- **Complete rewrite as a VS Code extension (TypeScript).** The standalone Python/Flet desktop app is retired; InsightCoder is now installable as a `.vsix` / from the Marketplace.
- **Conversations moved out of the repo.** Chats are stored as JSON in the extension's own global storage (per workspace) with a conversation-tab UI — nothing is written into the analyzed project anymore.
- **Context engine rebuilt:** one `git ls-files` call instead of per-file `git check-ignore` subprocesses, binary detection by content sniffing instead of an extension allowlist, include/exclude globs in settings, per-file size cap, and an explicit confirmation flow when the estimated context exceeds `insightcoder.context.maxTokens`.
- The `full_context.txt` debug dump is replaced by the `InsightCoder: Show Assembled Context` command.

### Added
- **Multi-provider support:** MiniMax M-series (or any OpenAI-compatible endpoint via `insightcoder.baseUrl`) as the primary provider, plus Google Gemini — switchable from a model dropdown mid-conversation.
- **Secure API key storage** in VS Code Secret Storage via `InsightCoder: Set API Key…` (replaces the `GEMINI_API_KEY` environment variable).
- **Conversation tabs** (new/switch/delete) and `Export Conversation as Markdown`.
- **Live token counter:** exact counts on Gemini; self-calibrating estimates on MiniMax (recalibrated from real usage each turn).
- Streaming cancellation (Stop button), chunk batching, and sanitized Markdown rendering (DOMPurify + highlight.js).
- Unit test suite (vitest) for the context engine, prompt builder, conversation store, and token service; `npm run test:live` smoke test against real provider endpoints.

## [v0.2.1] - 2025-08-16

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

## [v0.2.0] - 2025-08-16

### Changed
- **Complete Frontend and Architectural Rewrite:** The entire application frontend has been migrated from **PyQt5** to **Flet**. This is a ground-up rewrite aimed at modernizing the codebase, improving maintainability, and enabling simple cross-platform builds.
- **Modernized Concurrency Model:** Replaced the previous multi-threaded worker architecture (`ChatWorker`, `TokenCountWorker`, etc.) and PyQt's signal/slot system with a native `asyncio` implementation. This simplifies the code, eliminates complex threading logic, and improves efficiency.
    - Blocking operations (like API calls and file I/O) are now handled non-blockingly using `asyncio.to_thread`.
    - Real-time features like the token counter's debouncing are now elegantly handled with `asyncio.sleep`, removing the need for `QTimer`.
- **New Code Architecture:** Introduced a clean, three-tier architecture to separate concerns:
    - **State Management (`AppState`):** A central class holds all application state, making data flow predictable.
    - **Service Layer (`app_services.py`):** All backend logic (API calls, file operations, context management) is encapsulated in asynchronous services (`ChatService`, `ContextService`, etc.).
    - **UI Components:** The UI is broken down into logical Flet components (`ChatView`, `InputBar`) for better organization and reusability.
- **UI Rendering:** Replaced `QWebEngineView` with Flet's native `ft.Markdown` control for robust, built-in rendering of chat messages and code blocks.

### Removed
- **PyQt5 and PyQtWebEngine Dependencies:** Removed all PyQt-related libraries from `requirements.txt`, significantly reducing the project's dependency footprint.
- **Obsolete UI and Worker Code:** Deleted the legacy PyQt UI file (`ask_src/ui.py`), the original entry point (`ask.py`), and the PyQt-specific worker patterns. The new application entry point is the refactored `flet_ask.py`.

## [v0.1.7] - 2025-07-18

### Changed
- **Syntax Highlighting Engine:** Replaced the server-side `Pygments` library with the client-side `highlight.js` library for rendering syntax-highlighted code blocks. This change leverages `QWebEngineView` to delegate highlighting to JavaScript, resulting in significantly more robust and accurate code formatting in the chat display.
- **UI Rendering Logic:** Refactored `ask_src/ui.py` and `ask_src/worker.py` to remove the `codehilite` Markdown extension and instead load `highlight.js` assets and trigger the highlighting script within the `QWebEngineView`.

### Removed
- **`Pygments` Dependency:** Removed `Pygments` from `requirements.txt` and deleted the obsolete `pygments_default.css` file, simplifying the project's dependencies.

## [v0.1.6] - 2025-07-18

### Added
- **"Reload Context" Button:** Introduced a "Reload Context" button in the UI. This allows users to re-scan the project's codebase on demand, updating the AI's knowledge with the latest file changes without losing the current conversation history.
- **`ContextReloadWorker`:** Implemented a new background worker in `ask_src/worker.py` to handle the context reloading process asynchronously. This ensures the UI remains responsive while a new chat session is prepared with the updated context and existing conversation history.
- **Welcome Screen:** Added an initial welcome message that is displayed on application startup. It provides guidance and example prompts for new users and is replaced by the conversation once the first message is sent.

### Changed
- **Chat Rendering Engine:** Replaced the `QTextBrowser` widget with `QWebEngineView` for displaying chat messages. This change significantly improves the rendering quality and accuracy of Markdown and syntax-highlighted code blocks by leveraging a full web engine.
- **UI Logic:** Refactored `ask_src/ui.py` to support `QWebEngineView`, which involved embedding styled content within a full HTML structure and handling UI interactions like scrolling via JavaScript.

## [v0.1.5] - 2025-07-18

### Added
- **Conversation Summarization:** Implemented an intelligent system to automatically summarize conversations using the LLM. This provides long-term memory while significantly reducing the token count sent to the model, making context management more efficient and cost-effective.
- **`SummaryWorker`:** Introduced a new background thread in `ask_src/worker.py` to handle conversation summarization asynchronously. This ensures the UI remains responsive while summaries are being generated after a conversation is saved.
- **Startup Summarization:** Added logic to `ask.py` that automatically detects and summarizes any previously unsummarized conversation files when the application starts. This ensures all history is processed into efficient summaries before the chat session begins.
- **`.gitignore` Integration:** The `get_codebase` function now respects `.gitignore` rules by using the `git check-ignore` command, leading to a more accurate and relevant codebase context.
- **`reconstruct_markdown_history`:** A new helper function in `chat_utils.py` to convert saved conversation data back into a full markdown string, which is necessary for the summarization process.

### Changed
- **Context Management:** The system prompt (`create_system_prompt`) now loads concise conversation summaries instead of full conversation histories, optimizing token usage and improving performance.
- **Application Startup Flow:** Refactored `ask.py` to configure the API client once at startup and pass it to all necessary components. The startup sequence now completes all pending summarization tasks before launching the main UI.
- **Conversation Saving:** The `save_conversation_md` method in `ui.py` now triggers the `SummaryWorker` to create a summary file after successfully saving the full conversation markdown.

### Fixed
- **Conversation Counter:** Corrected an issue where the conversation counter could be miscalculated. It now accurately determines the next conversation number by checking for both `conversation_N.md` and `conversation_N_summary.md` files.
- **Path Exclusion:** Improved the logic for excluding the conversation directory from codebase analysis, making it more robust, especially when custom conversation paths are used.

## [v0.1.4] - 2025-04-21 

### Changed
- Refined `README.md` for greater conciseness and accuracy, updating information on features and getting started.
- Updated the referenced LLM model name (`gemini-2.5-flash-preview-04-17`) and its context window size (up to 1M tokens) in `README.md` to reflect the model used in `chat_utils.py`.
- Updated main prompt for better context and clarity.

### Fixed
- Resolved an issue when the conversation were not saved properly after the LLM complete the output.

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