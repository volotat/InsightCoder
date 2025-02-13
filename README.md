# InsightCoder

**InsightCoder** is a tool engineered to provide AI-powered insights directly into your codebase. Utilizing the power of Large Language Models (LLMs), InsightCoder empowers you to ask natural language questions about your software projects and receive intelligent, context-aware answers directly in your terminal.

Initially developed as an AI-powered assistant to aid in the development of the [Anagnorisis project](https://github.com/volotat/Anagnorisis) (a local recommendation system), InsightCoder has grown into a versatile standalone tool for any software development endeavor.

**⚠️ Important Notice**: InsightCoder operates by sending your project's source code to an LLM service (like Google Gemini) for in-depth analysis. **To protect your privacy, rigorously ensure that your project folders and files DO NOT contain any personal, confidential, or sensitive information when using InsightCoder.**

## Core Features

*   **Deep Codebase Analysis via AI:**  Employs cutting-edge LLMs to go beyond superficial keyword searches, offering a true understanding of your code's logic and structure.
*   **Intuitive Natural Language Queries:**  Pose questions about your project in plain English and receive detailed, insightful responses.
*   **Holistic Project Context:** InsightCoder analyzes your entire project, including Git diff information for the most up-to-date and relevant answers regarding recent changes.
*   **Clean Markdown Output with Syntax Highlighting:**  AI responses are presented in well-formatted Markdown, featuring syntax-highlighted code blocks for optimal readability and developer experience.
*   **Enhance Developer Workflow & Understanding:** Accelerate onboarding to new projects, quickly grasp complex logic, and streamline your development process with AI-powered assistance.
*   **Local Execution with Privacy in Mind:** Runs directly from your command line, ensuring your codebase data remains local and secure, only interacting with the LLM API during active query processing.

## Getting Started

**System Requirements:**

*   Python 3.8 or higher
*   pip package installer

**Installation Guide:**

1.  **Clone the InsightCoder GitHub Repository:**

    ```bash
    git clone https://github.com/volotat/InsightCoder # Replace with the actual repository URL
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
python ask.py --p /path/to/your/project
```

Replace `/path/to/your/project` with the actual path to the project you want to analyze.

If you omit the `--project-path` argument, InsightCoder will analyze the codebase in the current directory where you run the `ask.py` script.

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
*   "What is the purpose of the `CachedFileHash` class and how does it improve performance?"
*   "Identify potential memory leaks or performance bottlenecks within the `pages/images/engine.py` file."
*   "Explain the logic behind the music recommendation scoring system."
*   "Suggest refactoring strategies to enhance the modularity and maintainability of `app.py`."

## Future Directions

The vision for InsightCoder extends beyond a simple question-answering tool. Future development may explore:

*   **Evolving into an AI Code Agent:** Investigating the potential to transform InsightCoder into a more proactive AI agent capable of assisting in code development, suggesting improvements, and even generating code snippets with minimal oversight.
*   **Expanding LLM Support:**  Adding support for other popular Large Language Models beyond Google Gemini, offering users greater flexibility and choice.
*   **Enhanced Code Modification Capabilities:**  Potentially integrating features to allow InsightCoder to suggest and even automatically apply code refactoring or improvements based on its analysis.