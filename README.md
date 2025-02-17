# InsightCoder

**InsightCoder** is a tool engineered to provide AI-powered insights directly into your codebase. Utilizing Large Language Models (LLMs), InsightCoder empowers you to ask natural language questions about your software projects and receive intelligent, context-aware answers directly in your terminal.

Initially developed as an AI-powered assistant to aid in the development of the [Anagnorisis project](https://github.com/volotat/Anagnorisis) (a local recommendation system), InsightCoder has grown into a versatile standalone tool for any software development endeavor.

**⚠️ Important Notice**: InsightCoder operates by sending your project's source code to an LLM service (like Google Gemini) for in-depth analysis. **To protect your privacy, rigorously ensure that your project folders and files DO NOT contain any personal, confidential, or sensitive information when using InsightCoder.**

## Core Features

*   **Deep Codebase Analysis via AI:**  Utilizing Large Language Models (LLMs), InsightCoder provides a profound understanding of your codebase, going beyond keyword searches to analyze code logic and structure contextually.
*   **Large Context Window:** To effectively analyze entire codebases, InsightCoder leverages the `gemini-2.0-flash-thinking-exp-01-21` model. This model is currently chosen for its **extensive 1 million token context window**. This large context is crucial for processing potentially large project codebases in their entirety, ensuring the AI has a holistic understanding of the project.
*   **Intuitive Natural Language Queries:**  Pose questions about your project in plain English and receive detailed, insightful responses.
*   **Holistic Project Context:** InsightCoder analyzes your entire project, including Git diff information for the most up-to-date and relevant answers regarding recent changes.
*   **Clean Markdown Output with Syntax Highlighting:**  AI responses are presented in well-formatted Markdown, featuring syntax-highlighted code blocks for optimal readability and developer experience.
*   **Enhance Developer Workflow & Understanding:** Accelerate onboarding to new projects, quickly grasp complex logic, and streamline your development process with AI-powered assistance.
*   **Conversation History (Project Memory):** InsightCoder saves each conversation to a Markdown file within the `project_info/conversations` directory.
*   **Persistent Context:** This conversation history acts as a "memory," allowing InsightCoder to understand the ongoing context and provide more relevant responses in subsequent turns.
*   **Large Context Window Necessity:** Saving conversation history is another reason why a large context window is essential.  As conversations progress, the accumulated history needs to be within the model's context to maintain continuity and understanding.

## InsightCoder vs. GitHub Copilot: Key Differentiators

**Understanding Context Window & Token Usage:**  InsightCoder leverages a large context window (up to 1 million tokens) to analyze your entire codebase and conversation history.  **Tokens** are units of text that LLMs process.  The context window size limits the amount of text the AI can "remember" at once.  By keeping conversation history and codebase context within this window, InsightCoder provides informed and consistent answers.  You can monitor token usage in real-time in the UI to understand context consumption.

It's important to understand that **InsightCoder is not intended to replace tools like GitHub Copilot but rather to complement them.** They serve different primary purposes and excel in different areas. Here's a comparison:

| Feature             | InsightCoder                                  | GitHub Copilot                                  |
|----------------------|-----------------------------------------------|-------------------------------------------------|
| **Primary Purpose** | Codebase Understanding & Insights              | Code Completion & Generation                     |
| **Context Scope**   | **Entire Project Codebase**                    | Primarily Current File & Immediate Context      |
| **Analysis Focus**  | Project Architecture, Logic, Patterns          | Line-by-line Code, Snippets                     |
| **Query Type**      | Natural Language Questions about Codebase      | Code Context for Suggestions                    |
| **Conversation**    | Persistent Conversation History               | Contextual within Current Editing Session        |
| **Project Scope**   | **Any Git Repository** (Code, Docs, Books)    | Primarily Programming Code                      |
| **Tool Category**   | AI-Powered Codebase Analysis Tool             | AI Pair Programmer / Code Assistant             |

**InsightCoder excels at providing a holistic understanding of your project**, enabling you to ask broad questions and receive context-aware answers based on the entire codebase.  It's designed for scenarios where you need to grasp the overall architecture, understand complex logic spanning multiple files, or onboard to a new project quickly.

**GitHub Copilot, on the other hand, shines in real-time code completion and suggestion within your editor.** It's incredibly efficient for speeding up code writing and generating repetitive code blocks.

**Think of them as complementary tools:**

*   **Use GitHub Copilot** for accelerating your daily coding tasks, writing code more efficiently line-by-line.
*   **Use InsightCoder** when you need to step back and understand the project as a whole, ask high-level questions, or explore unfamiliar codebases.

## Getting Started

**System Requirements:**

*   Python 3.8 or higher
*   pip package installer

**Installation Guide:**

1.  **Clone the InsightCoder GitHub Repository:**

    ```bash
    git clone https://github.com/volotat/InsightCoder
    cd InsightCoder
    ```

2.  **Set Up a Virtual Environment (Best Practice):**

    ```bash
    python -m venv .env
    # Activate your virtual environment:
    # For Linux/macOS:
    source .env/bin/activate
    # For Windows:
    .env\Scripts\activate
    ```

3.  **Install Required Python Libraries:**

    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Your LLM API Key:**

    InsightCoder is currently configured to use the Google Gemini API.  Obtain your API key from [Google AI Studio](https://makersuite.google.com/app/apikey) and set it as an environment variable:

    ```bash
    export GEMINI_API_KEY="YOUR_API_KEY_HERE"  # Replace with your actual API key
    ```

## Analyzing a Specific Project Directory

To analyze a codebase in a directory other than the current one, use the `--project-path` or `-p` argument when running `ask.py`.

**Example:**

To analyze a project located at `/path/to/your/project`, run:

```bash
python ask.py -p /path/to/your/project
```
 
Replace `/path/to/your/project` with the actual path to the project you want to analyze.

If you omit the `--project-path` argument, InsightCoder will analyze the codebase in the current directory where you run the ask.py script.

## Specifying a Custom Conversation Folder

By default, conversation history is saved in the project_info/conversations directory within your project. To specify a custom folder for saving conversations, use the `--conversation-path` or `-c` argument:
Example:
To save conversations in /path/to/your/custom/conversations_folder, run:
```bash
python ask.py -c /path/to/your/custom/conversations_folder
```
 
Replace `/path/to/your/custom/conversations_folder` with the actual path to your desired conversation folder.
If you omit the `--conversation-path` argument, conversations will be saved in the default `/path/to/your/project/project_info/conversations` directory.

## Quick Start Guide

1.  **Open your Terminal and Navigate to the InsightCoder directory:**

    ```bash
    cd InsightCoder
    ```

2.  **Execute the `ask.py` script to begin an interactive session:**

    ```bash
    python ask.py
    ```

3.  **Start Interacting with your Codebase using Natural Language Questions!**

    Type your questions directly into the command line prompt. InsightCoder will process your query, analyze your project's code, and present the AI-generated response directly in your terminal window.

## Example Prompts

*   "Describe the overall architecture of this software project."
*   "Explain the purpose and functionality of the `MainWindow` class in `ui.py`."
*   "What is the purpose of the `CachedFileHash` class and how does it improve performance?"
*   "Are there any potential performance bottlenecks in the `chat_utils.py` file? If so, how can they be addressed?"
*   "Explain the logic behind the music recommendation scoring system."
*   "Suggest refactoring strategies to enhance the modularity and maintainability of `app.py`."
*   "How are API keys handled and secured within this project?"
*   "What are the key data structures used in `worker.py` and how do they contribute to the chat functionality?"
*   "Explain the role of signals and slots in the PyQt5 UI implementation."
*   "If I wanted to add support for a new Large Language Model, where would I need to make changes in the codebase?"
*   "Could you generate a class diagram representing the main classes and their relationships in this project?"
*   "What are the main differences between `ChatWorker` and `TokenCountWorker` classes?"
*   "How does InsightCoder handle errors and exceptions during API calls or file processing?"

## Future Directions

The vision for InsightCoder extends beyond a simple question-answering tool. Future development may explore:

*   **Evolving into an AI Code Agent:** Investigating the potential to transform InsightCoder into a more proactive AI agent capable of assisting in code development, suggesting improvements, and even generating code snippets with minimal oversight.
*   **Expanding LLM Support:**  Adding support for other popular Large Language Models beyond Google Gemini, offering users greater flexibility and choice.
*   **Enhanced Code Modification Capabilities:**  Potentially integrating features to allow InsightCoder to suggest and even automatically apply code refactoring or improvements based on its analysis.

## Beyond Code: Analyzing Any Git Repository

While named "InsightCoder," this tool is not limited to just programming code. **InsightCoder can effectively analyze any project that is managed within a Git repository.** This includes:

*   **Documentation Projects:** Understand the structure and content of large documentation sets.
*   **Book Manuscripts:** Analyze chapters, characters, or plotlines within a book project.
*   **Blog Content:** Get insights into the themes, topics, or organization of a blog repository.
*   **Configuration Repositories:** Analyze complex configuration setups.

**As long as your project is in Git, InsightCoder can provide AI-powered insights by analyzing its content and structure.** Simply point InsightCoder to the root directory of your Git repository using the `--project-path` argument, and start asking questions!

## Contributing & Bug Reports

Bug reports and questions are welcome! If you encounter any issues, questions or have suggestions for improvements, please [open a new issue](https://github.com/volotat/InsightCoder/issues) on GitHub.
## License
InsightCoder is released under the [MIT License](LICENSE).

