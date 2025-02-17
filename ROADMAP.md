# InsightCoder Project Roadmap

This document outlines the planned development roadmap for the InsightCoder project. It is a living document and will be updated as the project evolves and we gather community feedback.

## Short-Term Vision

*   **Focus:**  Enhancing User Experience and Conversation Management.
    *   **Documentation Improvements:**
        *   [x] Expand "Example Prompts" section in `README.md` with more diverse and practical examples.
        *   [x] **Clarify in documentation**: Add detailed explanation of conversation history, context window, and token usage in `README.md` to improve user understanding.
    *   **UI/UX Enhancements:**
        *   [x] **Conversation Folder Control:**
            *   [x] **High Priority:** Implement a robust way for users to specify and manage the conversation folder, ensuring persistent conversation history even if the folder is Git-ignored.  *(e.g., command-line option, config file)*
            *   [x] **`.gitignore` Handling:** Ensure conversation loading works correctly even if the conversation folder is in `.gitignore` (for privacy and to avoid Git tracking conversation history).
    *   **Automated Diff Application (Initial Stage):**
        *   [x] **Diff Detection:** Implement logic to automatically detect code diff blocks within the AI's responses. *(Look for Markdown code blocks with "diff" or similar language hints)*.
        *   [x] **File Path Extraction & Validation:**  Extract the file path from the detected diff and validate that the file exists in the analyzed project.
        *   [ ] **High Priority & Crucial:**  Implement a **pop-up confirmation dialog** in the UI that appears when a diff is detected, asking the user "Would you like to apply these changes to `{file_path}` file?".
        *   [ ] **Visual Diff Display (Basic):** Display the code diff in the confirmation dialog, ideally with a side-by-side or clear visual representation of the changes *(similar to a simplified VS Code diff view)*.
        *   [ ] **Apply Diff on User Confirmation:** If the user confirms, implement the functionality to automatically apply the detected diff to the specified file in the project.
    *   **Code Cleanup and Minor Refactoring:**
        *   [ ] Review code and add more comments, especially in `chat_utils.py` and `ui.py`.
        *   [ ] Double-check and improve robustness of file path handling.

## Medium-Term Goals

*   **Focus:**  Introducing AI Code Agent Capabilities and Deeper Code Understanding.
    *   **Code Modification Suggestions (Initial Stage):**
        *   [ ] **Experiment:** Research and prototype the ability to suggest code refactoring opportunities based on AI analysis.  *(Initial focus: simple refactorings, e.g., function renaming, variable extraction)*.
        *   [ ] **UI Integration (Basic):**  Explore how to display refactoring suggestions in the UI (initially, perhaps as text output in the chat).
    *   **Improved Contextual Awareness:**
        *   [ ] **Research:** Investigate techniques for deeper code structure understanding (static analysis, code parsing libraries).
        *   [ ] **Symbol Understanding (Initial):** Enhance AI's ability to understand basic code symbols (functions, classes) within a file.
    *   **Conversation History Management:**
        *   [ ] Implement a basic UI element to list saved conversations for easier access.
    *   **Automated Code Changes via Git Pushes (AI-Driven Development):**
        *   [ ] **Feasibility Study & Design:**  Thoroughly research and design the architecture for automated code changes via Git pushes.
        *   [ ] **Git Integration:** Implement Git functionality within InsightCoder to stage, commit, and push changes.
        *   [ ] **Authentication & Security:** Securely manage GitHub credentials and implement robust security measures to prevent unintended pushes.
        *   [ ] **User Review Workflow:** Design a workflow where AI-suggested changes are presented to the user for review and approval *before* Git push.
        *   [ ] **Automated Refactoring & Code Improvement:** Develop AI capabilities to proactively identify and suggest code improvements, refactorings, and potentially even generate new code snippets, automatically creating Git commits for these suggestions.

## Long-Term Vision 

*   **Focus:**  Evolving into a Proactive AI Code Agent, IDE Integration, and Advanced Features.
    *   **IDE/Editor Integration:**
        *   [ ] Explore and begin development of plugins/extensions for popular IDEs (VS Code, IntelliJ IDEA).
    *   **Advanced Features:**
        *   [ ] Project "Personality" and Customization (project-specific prompts, persona definition).
        *   [ ] Continuous Code Monitoring and Real-time Insights.
        *   [ ] Support for more LLMs.

---

*This roadmap is subject to change and will be updated periodically based on progress, community feedback, and new opportunities.*
