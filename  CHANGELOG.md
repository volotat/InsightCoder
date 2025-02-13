# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


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

### Deprecated
- (None in this release)

### Removed
- (None in this release)

### Security
- (No specific security changes in this release)


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

### Fixed
- (None explicitly fixed in this initial release, but various improvements and refactoring were done during the separation from Anagnorisis).

### Deprecated
- (None in this initial release).

### Removed
- Grooveshark related notes from `README.md`.
- Anagnorisis specific branding and references throughout the codebase.

### Security
- (No specific security changes in this initial release, but privacy warning regarding LLM data handling is included in `README.md`).
