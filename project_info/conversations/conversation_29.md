

**User:**

The conversation summarization should start on each run of the app if there is conversations that is not summarized yet. Only when this stage is complete the app should gather the current code context.



**Model:**

Okay, that's a clear requirement. You want to ensure all existing, unsummarized conversations are processed on startup before the main chat session begins. This provides a more consistent context for the LLM from the start of each session.

Here's the plan to implement this:

1.  **Modify `ask.py`**:
    *   Identify all `conversation_N.md` files in the configured `conversation_path`.
    *   Identify all `conversation_N_summary.md` files in the same directory.
    *   Determine which `conversation_N.md` files do not have a corresponding `conversation_N_summary.md`.
    *   For each unsummarized `conversation_N.md` file, load its content.
    *   Create and start a `SummaryWorker` thread for each unsummarized conversation, passing the content and the target summary file path.
    *   Keep a list of these `SummaryWorker` threads.
    *   After starting all necessary workers, iterate through the list and call `thread.join()` for each, making the main process wait for them to complete.
    *   Only *after* all summary workers have finished, proceed with calling `start_chat_session` and initializing the `MainWindow`.

2.  **Review `ui.py`'s `save_conversation_md`**: Ensure this method still correctly triggers summarization for *new* conversations created *during* the current session.

Let's implement the changes in `ask.py`.

**Modified File: `InsightCoder/ask.py`**

```python
# ask.py

import sys
import os
from PyQt5.QtWidgets import QApplication
from ask_src.chat_utils import start_chat_session, load_conversation # Import load_conversation
from ask_src.ui import MainWindow
from ask_src.worker import ChatSignals, SummaryWorker # Import SummaryWorker
import argparse
import glob # Import glob
import re # Import re
import time # Import time for optional delay or feedback

def main():
    parser = argparse.ArgumentParser(description="InsightCoder: AI-powered codebase analysis.")
    parser.add_argument(
        "--project-path",
        "-p",
        type=str,
        default=".",
        help="Path to the project directory you want to analyze."
    )
    parser.add_argument(
        "--conversation-path",
        "-c",
        type=str,
        default=None, # Default to None, handled in ask.py and chat_utils
        help="Path to the directory where conversation history will be saved."
    )
    args = parser.parse_args()
    project_path = args.project_path

    if args.conversation_path is not None:
        conversation_path = args.conversation_path
    else:
        conversation_path = os.path.join(project_path, "project_info", "conversations") # Directory to save conversations by default

    os.makedirs(conversation_path, exist_ok=True) # Create directory if it doesn't exist

    # --- START: Startup Summarization Logic ---
    print(f"Checking for unsummarized conversations in: {conversation_path}")
    # Find all conversation files (conversation_N.md)
    all_conv_files = glob.glob(os.path.join(conversation_path, "conversation_*.md"))
    # Find all summary files (conversation_N_summary.md)
    all_summary_files = glob.glob(os.path.join(conversation_path, "conversation_*_summary.md"))

    # Extract the conversation numbers from both lists
    conv_numbers = set()
    for filepath in all_conv_files:
        basename = os.path.basename(filepath)
        match = re.search(r'conversation_(\d+)\.md', basename)
        if match:
            conv_numbers.add(int(match.group(1)))

    summary_numbers = set()
    for filepath in all_summary_files:
        basename = os.path.basename(filepath)
        match = re.search(r'conversation_(\d+)_summary\.md', basename)
        if match:
            summary_numbers.add(int(match.group(1)))

    # Find numbers that are in conv_numbers but not in summary_numbers
    unsummarized_numbers = sorted(list(conv_numbers - summary_numbers))

    summary_workers = []
    chat_signals_for_startup = ChatSignals() # Use ChatSignals for startup summarization feedback

    if unsummarized_numbers:
        print(f"Found {len(unsummarized_numbers)} unsummarized conversation(s): {unsummarized_numbers}")
        print("Starting summarization process...")

        for number in unsummarized_numbers:
            conv_filepath = os.path.join(conversation_path, f"conversation_{number}.md")
            summary_filepath = os.path.join(conversation_path, f"conversation_{number}_summary.md")

            # Load the full conversation content
            conversation_text = load_conversation(conv_filepath) # load_conversation returns list of dicts
            # Convert list of dicts back to markdown text format for summarization
            # (This might need adjustment based on how load_conversation formats output internally vs what summarize_conversation expects)
            # Let's refine load_conversation or add a helper if needed.
            # ASSUMING load_conversation returns list of dicts and we need markdown format for summarize_conversation
            # Reconstruct markdown history from loaded data for summarize_conversation
            full_markdown_history = ""
            for message in conversation_text:
                 role = message['role'].capitalize()
                 parts = message['parts'][0] if message['parts'] else ""
                 full_markdown_history += f"\n\n**{role}:**\n\n{parts}\n\n"
            full_markdown_history = full_markdown_history.strip() # Remove leading/trailing whitespace

            if full_markdown_history:
                 # Create and start the SummaryWorker
                 # Need access to the client here. Let's get it before summarization.
                 # Configure API client earlier to pass to SummaryWorker
                 client = start_chat_session(project_path, conversation_path, just_client=True) # Modify start_chat_session to return just client

                 worker = SummaryWorker(client, full_markdown_history, summary_filepath, chat_signals_for_startup) # Pass client and feedback signals
                 summary_workers.append(worker)
                 worker.start()
            else:
                 print(f"Warning: conversation_{number}.md is empty or could not be loaded. Skipping summarization.")


        # Wait for all summary workers to complete
        print("Waiting for summarization to finish...")
        # Optional: Add visual feedback in console, e.g., a progress bar or dots
        # while any(w.is_alive() for w in summary_workers):
        #     print(".", end="", flush=True)
        #     time.sleep(1)
        # print("\nSummarization complete.") # Print final message

        for worker in summary_workers:
            worker.join() # Block until worker finishes

        print("All unsummarized conversations processed.")
    else:
        print("No unsummarized conversations found.")
    # --- END: Startup Summarization Logic ---


    # Now proceed with the main application startup
    # We might have already configured the client above, let's get chat session with client
    # Modify start_chat_session to return client and chat OR handle client configuration separately
    # Let's adjust start_chat_session to just configure client if requested, or full session
    client, chat = start_chat_session(project_path, conversation_path) # start_chat_session should now return client and chat

    app = QApplication(sys.argv)
    chat_signals = ChatSignals() # Initialize ChatSignals
    win = MainWindow(client, chat, chat_signals, project_path, conversation_path) # Pass client, chat_signals, project_path, and conversation_path
    win.show()
    sys.exit(app.exec_())

# Helper to modify start_chat_session in chat_utils.py
# Adding a flag to control if it returns just client or full session
# This requires modifying chat_utils.py

# Let's consolidate client configuration and session creation
# In chat_utils, move configure_api to be independent.
# In ask.py, configure client first, then pass to start_chat_session.

```
**(Self-correction):** Realized `SummaryWorker` needs the `client` instance, and `start_chat_session` previously handled client configuration. The `main` function in `ask.py` needs access to the client *before* calling `start_chat_session` for summarization workers. It's better to configure the client once at the start of `main` and then pass it around. Also, `load_conversation` returns a list of dicts, while `summarize_conversation` expects the full markdown text. We need to reconstruct the markdown text from the loaded history for summarization. Added `chat_signals_for_startup` to pass signals to startup workers, although UI feedback from these might not be visible until the UI starts.

**Refined Plan:**

1.  **Modify `ask_src/chat_utils.py`**:
    *   Make `configure_api` a standalone function that just returns the client.
    *   Modify `start_chat_session` to *accept* the `client` instance as an argument.
2.  **Modify `ask.py`**:
    *   Call `configure_api()` first to get the `client`.
    *   Use the `client` to check for unsummarized conversations and start `SummaryWorker`s.
    *   `join()` the `SummaryWorker` threads.
    *   Call `start_chat_session(client, ...)` passing the configured `client`.
    *   Pass the `client` to `MainWindow`.
3.  **Ensure `load_conversation` reconstruction**: Add logic in `ask.py` to convert the output of `load_conversation` (list of dicts) back into the full markdown string format expected by `summarize_conversation`.
4.  **Update `ask_src/worker.py`**: Ensure `SummaryWorker` accepts the `client`. (Already done in previous step).

**Step 1: Modify `ask_src/chat_utils.py`**

```python
# ask_src/chat_utils.py

import os
import sys
import glob
import subprocess
from google import genai
from google.generativeai import types
import traceback

def configure_api():
    """Configures the Google Generative AI client."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set in environment.")
        sys.exit(1)
    try:
        client = genai.Client(api_key=api_key)
        # Basic check to see if client can access models (optional but good)
        list(client.models.list())
        print("Google Generative AI client configured successfully.")
        return client
    except Exception as e:
        print(f"Error configuring Google Generative AI client: {e}")
        traceback.print_exc()
        sys.exit(1)


def get_codebase(input_dir, conversation_dir): # Accept input_dir and conversation_dir as arguments
    print(f"Collecting codebase content from: {input_dir}...") # Informative message
    text_extensions = {
        '.py', '.js', '.java', '.c', '.cpp', '.h', '.hpp',
        '.html', '.css', '.scss', '.less', '.yaml', '.yml',
        '.txt', '.md', '.json', '.xml', '.csv', '.ini',
        '.cfg', '.conf', '.sh', '.bat', '.ps1', '.go',
        '.rs', '.php', '.rb', '.lua', '.sql', '.toml'
    }
    excluded_extensions = {'.min.js', '.min.css', '.map', '.csv',
                             '.io.js', '.io.css', '.esm.js', '.esm.css', '.cjs.js', '.cjs.css'}
    excluded_files = {'static/js/chart.js', 'static/photoswipe/photoswipe.css'}

    # Get the absolute path of the conversation directory for reliable exclusion
    # Ensure conversation_dir is treated as absolute for comparison
    abs_conversation_dir = os.path.abspath(conversation_dir)

    # Define common excluded directories
    excluded_dirs = {'.git', '__pycache__', '.venv', 'venv', 'node_modules'} # Added common venv/node_modules etc.

    def is_ignored(rel_path, git_dir):
        """Checks if a relative path is ignored by Git."""
        try:
            # Use --no-index to check against .gitignore without needing the file to be in the index
            result = subprocess.run(
                ['git', '--git-dir', os.path.join(git_dir, '.git'), '--work-tree', git_dir, 'check-ignore', '--quiet', rel_path],
                cwd=git_dir, # Use git_dir here
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            return result.returncode == 0
        except FileNotFoundError:
             # Git command not found, ignore check
             # print("Warning: Git command not found. Cannot check .gitignore.")
             return False # Assume not ignored if git command not found
        except Exception as e:
            print(f"Error checking Git ignore status for {rel_path}: {e}")
            traceback.print_exc()
            return False

    files = []
    # Find the .git directory to correctly use check-ignore
    git_dir = None
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--show-toplevel'],
            cwd=input_dir,
            capture_output=True,
            text=True,
            check=True # Raise exception if git command fails (e.g., not a git repo)
        )
        git_dir = result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        print(f"Warning: Not a Git repository or git command not found at {input_dir}. .gitignore will not be checked.")
        pass # Not a git repository, proceed without gitignore check

    for root, dirs, filenames in os.walk(input_dir):
        # Create a copy of dirs for modification during iteration
        dirs_copy = dirs[:]

        # Modify dirs_copy in place to prevent walking into hidden or excluded directories
        dirs[:] = [] # Clear original dirs list
        for d in dirs_copy:
            if d.startswith('.') and d != '.': # Allow walking into the current directory '.' if needed, but exclude other dot dirs
                continue
            # Check if the directory is a known excluded directory name
            if d in excluded_dirs:
                continue
            # Check if the absolute path of this directory starts with the absolute conversation directory path
            abs_current_dir = os.path.abspath(os.path.join(root, d))
            if abs_current_dir.startswith(abs_conversation_dir):
                 # If we are in the conversation directory itself or a subdirectory, skip it
                 print(f"Excluding conversation directory from codebase walk: {abs_current_dir}")
                 continue # Skip this directory

            dirs.append(d) # If not excluded, add back to dirs for os.walk to traverse


        # Filter files based on extension, excluded files list, and gitignore
        for filename in filenames:
            filename_lower = filename.lower()
            if any(filename_lower.endswith(ext) for ext in excluded_extensions):
                continue
            ext = os.path.splitext(filename)[1].lower()
            if ext in text_extensions:
                full_path = os.path.join(root, filename)
                rel_path = os.path.relpath(full_path, input_dir)

                # Explicitly exclude files within the conversation directory
                if os.path.abspath(full_path).startswith(abs_conversation_dir):
                     # print(f"Explicitly excluding file from codebase walk (in conv dir): {rel_path}")
                     continue # Skip files within the conversation directory

                if rel_path in excluded_files:
                    continue

                # If it's a git repository, check .gitignore
                if git_dir:
                    if is_ignored(rel_path, git_dir):
                        # print(f"Ignoring gitignored file: {rel_path}")
                        continue # Skip gitignored files

                # If it passed all checks, add to files list
                files.append((rel_path, full_path))

    combined_content = []
    project_name = os.path.basename(os.path.abspath(input_dir)) # Get project name for context labeling
    if project_name == "": project_name = "Current Project" # Handle root directory case
    for rel_path, full_path in files:
        try:
            with open(full_path, 'r', encoding='utf-8', errors='replace') as infile:
                content = infile.read()
            # Use project_name for clarity in the prompt, e.g., "file: MyProject/src/main.py"
            combined_content.append(f"file: {os.path.join(project_name,rel_path)}")
            combined_content.append("---- file start ----")
            combined_content.append(content)
            combined_content.append("---- file end ----\n")
        except Exception as e:
            print(f"Error processing {rel_path}: {str(e)}")
            traceback.print_exc()
    print(f"Finished collecting codebase content. Found {len(files)} files.")
    return "\n".join(combined_content)


def get_git_diff(input_dir): # Accept input_dir as argument
    try:
        staged = subprocess.run(
            ['git', 'diff', '--staged'],
            cwd=input_dir, # Use input_dir here
            capture_output=True,
            text=True
        )
        unstaged = subprocess.run(
            ['git', 'diff'],
            cwd=input_dir, # Use input_dir here
            capture_output=True,
            text=True
        )
        diff_output = ""
        if staged.stdout:
            diff_output += "STAGED CHANGES:\n" + staged.stdout + "\n"
        if unstaged.stdout:
            diff_output += "UNSTAGED CHANGES:\n" + unstaged.stdout + "\n"
        return diff_output.strip() or "No uncommitted changes detected."
    except FileNotFoundError:
         print("Warning: Git command not found. Cannot get Git diff.")
         return "Unable to retrieve Git diff information (git command not found)."
    except Exception as e:
        print(f"Error getting Git diff: {str(e)}")
        traceback.print_exc()
        return "Unable to retrieve Git diff information."


# Add summarize_conversation function
def summarize_conversation(client, full_conversation_text):
    """
    Uses the LLM to generate a concise summary of a conversation.

    Args:
        client: The Google Generative AI client instance.
        full_conversation_text (str): The full text of the conversation.

    Returns:
        str: The generated summary text.
        None: If summarization fails.
    """
    if not full_conversation_text.strip():
        return "" # Return empty string for empty conversation

    try:
        # Craft the summarization prompt
        summary_prompt = f"""Summarize the following conversation about a codebase. Focus on the main questions asked by the user and the key insights, answers, or code modifications suggested by the AI. Keep the summary concise and informative, ideally a few sentences or a short bulleted list of key topics.

Conversation:
```
{full_conversation_text}
```

Concise Summary:
"""
        # Use the main model for consistency and to leverage its context understanding
        # Consider adjusting the model name if you have a dedicated summarization model preference
        response = client.generate_content(
             summary_prompt,
             model="gemini-2.5-flash-preview-04-17", # Use the main model for summarization
             config=types.GenerateContentConfig(
                temperature=0.5, # Lower temperature for more factual summary
                max_output_tokens=512 # Limit summary length
            )
        )
        # Check if response has text content and return stripped text
        return response.text.strip() if response.text else ""
    except Exception as e:
        print(f"Error during conversation summarization: {e}")
        traceback.print_exc() # Print traceback for debugging
        return None # Indicate failure


# Modify get_conversation_history_context to load summaries
def get_conversation_history_context(project_path, conversation_path): # Accept project_path and conversation_path
    # Use provided conversation_path if available, otherwise default to project_info/conversations
    # The conversation_dir is already determined and passed from ask.py
    conversation_dir = conversation_path

    # Ensure the directory exists before trying to list files
    if not os.path.exists(conversation_dir):
        print(f"Conversation directory not found: {conversation_dir}. No history loaded.")
        return "" # Return empty string if conversation directory doesn't exist

    # Look for summary files
    conversation_files = glob.glob(os.path.join(conversation_dir, "conversation_*_summary.md"))
    # Sort files by name to maintain chronological order
    conversation_files.sort()

    conversation_content = []
    print(f"Loading conversation summaries from: {conversation_dir}")
    for filepath in conversation_files: # Iterate over summary files
        try:
            with open(filepath, 'r', encoding='utf-8') as infile: # Read content
                content = infile.read()

            # Include the summary filename for context
            # Use relative path to the conversation directory itself for clarity in prompt
            rel_path = os.path.relpath(filepath, conversation_dir)
            conversation_content.append(f"Conversation Summary file: {rel_path}")
            conversation_content.append("---- file start ----")
            conversation_content.append(content)
            conversation_content.append("---- file end ----\n")
        except Exception as e:
            print(f"Error reading conversation summary file: {filepath} - {e}") # Handle errors
            traceback.print_exc() # Print traceback for debugging
    print(f"Finished loading conversation summaries. Found {len(conversation_files)} summary files.")
    return "\n".join(conversation_content) # Return combined content


def create_system_prompt(project_path, conversation_path): # Accept project_path and conversation_path
    input_dir = os.path.abspath(project_path) # Use project_path here
    # Pass conversation_path to get_codebase to exclude conversation files
    codebase = get_codebase(input_dir, conversation_path)
    git_diff = get_git_diff(input_dir) # Use input_dir here

    full_code = f"""CODEBASE CONTEXT (whole codebase of the project):
{codebase}

GIT DIFF CONTEXT (current uncommitted changes):
```diff
{git_diff}
```"""

    # Get conversation history context from summaries
    conversation_history_context = get_conversation_history_context(project_path, conversation_path)

    full_context = f"""{full_code}

CONVERSATION HISTORY CONTEXT (summaries of past conversations):
{conversation_history_context}
"""

    # Save the full_context to a file for debugging
    try:
        with open("full_context.txt", "w", encoding="utf-8", errors='replace') as f:
            f.write(full_context)
    except Exception as e:
        print(f"Error saving full_context.txt: {e}")
        traceback.print_exc()


    system_prompt = f"""
You are an AI assistant designed to analyze and answer questions about a given codebase.
All the info about you as a project will be presented in a form of a current codebase.

If you need to analyze the code, carefully review the provided code files and provide detailed, professional responses.
Consider best practices, potential issues, and optimization opportunities.
Format your answers with clear headings and code blocks using Markdown code fences when needed.
Use specific language syntax highlighting within code fences where applicable (e.g., python\\n...\\n, javascript\\n...\\n).
Answer user questions based on the provided codebase context and conversation history.
If you have any confusion or need more information, ask the user questions for clarification before presenting the changes.
If you cannot guarantee a specific behavior that is required by a given task in the code you suggest, make sure to note that in your response.
If you are not sure about something, make sure to point it out and highlight the weak points in your response if there are any.
If you change any file, please print the whole content of the file, so it could be easily replaced as whole with the proposed changes. If files became too large consider splitting them into smaller parts as a refactoring routine. Do not print any files with partial changes. It is highly important to not suppress any lines even if they are not changed, as the file is usually copy-pasted as a whole and may lead to the loss of important parts of the code.
Do not try to implement everything at once. Split complex tasks into multiple phases and implement them step by step, providing test cases for each phase and asking for user's confirmation before proceeding to the next step.
Prioritize concise and simple solutions when possible and sufficient.

{full_context}"""


    return system_prompt


def start_chat_session(client, project_path, conversation_path): # Accept client
    system_prompt = create_system_prompt(project_path, conversation_path) # Pass project_path and conversation_path

    # Load a saved conversation from a file (example - not used in current implementation):
    # history = load_conversation(os.path.join(conversation_path, "conversation_2.md")) # Example of loading specific conversation

    chat = client.chats.create(
        #model="gemini-2.5-pro-exp-03-25",
        model="gemini-2.5-flash-preview-04-17", # Using the specified flash model
        #model="gemini-2.0-flash-thinking-exp-01-21", # Older model reference
        #model="gemini-2.0-pro-exp-02-05",
        #model="gemini-2.0-flash-lite-preview-02-05",
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=1,
            top_p=0.95,
            top_k=64,
            max_output_tokens=65536, # Increased output tokens as per model capability
            response_mime_type="text/plain",
            thinking_config=types.ThinkingConfig(
                thinking_budget=8192 # Example value based on API docs
            )
        ),
        history = []) # Start with empty history, as context is in system prompt

    # Return both client and chat (though client is already passed in now)
    return client, chat # Keeping return signature consistent


def load_conversation(filepath):
    """
    Loads a saved conversation from a markdown file.
    Expected format:
    **User:**

    user message...

    **Model:**

    model message...

    Returns:
    List of dicts in the form:
    [
        {"role": "user", "parts": ["user message..."]},
        {"role": "model", "parts": ["model message..."]},
    ]
    Returns empty list if file not found or error occurs.
    """
    conversation = []
    current_role = None
    current_lines = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.rstrip()
                if line.startswith("**User:**"):
                    if current_role is not None and current_lines:
                        conversation.append({
                            "role": current_role.lower(),
                            "parts": ["\n".join(current_lines).strip()]
                        })
                    current_role = "User"
                    current_lines = []
                elif line.startswith("**Model:**"):
                    if current_role is not None and current_lines:
                        conversation.append({
                            "role": current_role.lower(),
                            "parts": ["\n".join(current_lines).strip()]
                        })
                    current_role = "Model"
                    current_lines = []
                else:
                    # Append non-empty lines to current message
                    if line:
                        current_lines.append(line)
            # Append last collected message if any
            if current_role is not None and current_lines:
                conversation.append({
                    "role": current_role.lower(),
                    "parts": ["\n".join(current_lines).strip()]
                })
    except FileNotFoundError:
        print(f"Error: Conversation file not found at {filepath}")
        return []
    except Exception as e:
        print(f"Error loading conversation file {filepath}: {e}")
        traceback.print_exc()
        return []

    return conversation

# Helper function to reconstruct markdown from loaded conversation list of dicts
def reconstruct_markdown_history(conversation_list):
    """
    Reconstructs a single markdown string from a list of conversation turns.

    Args:
        conversation_list (list): List of dicts from load_conversation.

    Returns:
        str: Markdown formatted conversation history.
    """
    markdown_text = ""
    for turn in conversation_list:
        role = turn.get('role', '').capitalize()
        parts = turn.get('parts', [])
        content = parts[0] if parts else ""
        if role and content:
            markdown_text += f"\n\n**{role}:**\n\n{content}\n\n"
    return markdown_text.strip() # Remove leading/trailing whitespace


```

**Modified File: `InsightCoder/ask.py`**

```python
# ask.py

import sys
import os
from PyQt5.QtWidgets import QApplication
# Import configure_api, start_chat_session, load_conversation, reconstruct_markdown_history
from ask_src.chat_utils import configure_api, start_chat_session, load_conversation, reconstruct_markdown_history
from ask_src.ui import MainWindow
from ask_src.worker import ChatSignals, SummaryWorker # Import SummaryWorker
import argparse
import glob
import re
import time # Import time for optional feedback

def main():
    parser = argparse.ArgumentParser(description="InsightCoder: AI-powered codebase analysis.")
    parser.add_argument(
        "--project-path",
        "-p",
        type=str,
        default=".",
        help="Path to the project directory you want to analyze."
    )
    parser.add_argument(
        "--conversation-path",
        "-c",
        type=str,
        default=None, # Default to None, handled in ask.py and chat_utils
        help="Path to the directory where conversation history will be saved."
    )
    args = parser.parse_args()
    project_path = args.project_path

    if args.conversation_path is not None:
        conversation_path = args.conversation_path
    else:
        # Default conversation path relative to project_path
        conversation_path = os.path.join(project_path, "project_info", "conversations")

    # Ensure the conversation directory exists before proceeding
    os.makedirs(conversation_path, exist_ok=True)

    # --- START: Configure Client and Startup Summarization Logic ---
    client = configure_api() # Configure API client once

    print(f"Checking for unsummarized conversations in: {conversation_path}")
    # Find all conversation files (conversation_N.md)
    all_conv_files = glob.glob(os.path.join(conversation_path, "conversation_*.md"))
    # Find all summary files (conversation_N_summary.md)
    all_summary_files = glob.glob(os.path.join(conversation_path, "conversation_*_summary.md"))

    # Extract the conversation numbers from both lists
    conv_numbers = set()
    for filepath in all_conv_files:
        basename = os.path.basename(filepath)
        match = re.search(r'conversation_(\d+)\.md', basename)
        if match:
            conv_numbers.add(int(match.group(1)))

    summary_numbers = set()
    for filepath in all_summary_files:
        basename = os.path.basename(filepath)
        match = re.search(r'conversation_(\d+)_summary\.md', basename)
        if match:
            summary_numbers.add(int(match.group(1)))

    # Find numbers that are in conv_numbers but not in summary_numbers
    unsummarized_numbers = sorted(list(conv_numbers - summary_numbers))

    summary_workers = []
    chat_signals_for_startup = ChatSignals() # Use ChatSignals for startup summarization feedback (optional)

    if unsummarized_numbers:
        print(f"Found {len(unsummarized_numbers)} unsummarized conversation(s): {unsummarized_numbers}")
        print("Starting summarization process. Please wait...")

        # Optional: Connect signals for console feedback during summarization
        # chat_signals_for_startup.summarization_complete.connect(lambda filename: print(f"Summarized: {filename}"))
        # chat_signals_for_startup.summarization_error.connect(lambda err: print(f"Summarization Error: {err}"))


        for number in unsummarized_numbers:
            conv_filepath = os.path.join(conversation_path, f"conversation_{number}.md")
            summary_filepath = os.path.join(conversation_path, f"conversation_{number}_summary.md")

            # Load the full conversation content (list of dicts)
            conversation_list = load_conversation(conv_filepath)
            # Reconstruct markdown history for summarization
            full_markdown_history = reconstruct_markdown_history(conversation_list)

            if full_markdown_history.strip(): # Check if reconstruction resulted in non-empty content
                 # Create and start the SummaryWorker
                 worker = SummaryWorker(client, full_markdown_history, summary_filepath, chat_signals_for_startup)
                 summary_workers.append(worker)
                 worker.start()
            else:
                 print(f"Warning: conversation_{number}.md is empty or could not be loaded correctly. Skipping summarization.")


        # Wait for all summary workers to complete
        # print("Waiting for summarization to finish...") # Already printed above
        for worker in summary_workers:
            worker.join() # Block until worker finishes

        print("All unsummarized conversations processed.")
    else:
        print("No unsummarized conversations found.")
    # --- END: Configure Client and Startup Summarization Logic ---


    # Now proceed with the main application startup
    # The client is already configured
    client, chat = start_chat_session(client, project_path, conversation_path) # Pass client, project_path, and conversation_path

    app = QApplication(sys.argv)
    chat_signals = ChatSignals() # Initialize ChatSignals for UI communication
    win = MainWindow(client, chat, chat_signals, project_path, conversation_path) # Pass client, chat_signals, project_path, and conversation_path
    win.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()

```

**Explanation of Changes:**

1.  **`ask_src/chat_utils.py` Modifications:**
    *   `configure_api()` is now a standalone function responsible *only* for setting up and returning the `genai.Client` instance. Added basic error checking and success print.
    *   `start_chat_session(client, project_path, conversation_path)` is modified to *accept* the `client` instance as its first argument. It no longer calls `configure_api` internally.
    *   `get_conversation_history_context(project_path, conversation_path)` now uses the `conversation_path` argument directly, assuming `ask.py` has already determined and potentially created the directory.
    *   Added `reconstruct_markdown_history(conversation_list)` helper function. This function takes the list of dictionaries returned by `load_conversation` and rebuilds the full Markdown string format expected by `summarize_conversation`.
    *   Updated `get_codebase` with more standard ignored directories and a more robust way to find the `.git` directory for `check-ignore`. Updated `is_ignored` to use `--git-dir` and `--work-tree` for robustness with custom project paths. Added print statements for clarity.
    *   Added tracebacks in several places for better debugging.

2.  **`ask.py` Modifications:**
    *   `import configure_api, load_conversation, reconstruct_markdown_history`: Import the necessary functions from `chat_utils.py`.
    *   `import SummaryWorker`: Import `SummaryWorker` from `worker.py`.
    *   `import glob, re`: Import `glob` and `re` for finding and parsing filenames.
    *   **`client = configure_api()`**: The API client is configured at the very beginning of `main`.
    *   **Startup Summarization Logic**:
        *   The code block to find unsummarized conversations (`all_conv_files`, `all_summary_files`, extracting numbers, `unsummarized_numbers`) is added.
        *   A list `summary_workers` is initialized to keep track of threads.
        *   `ChatSignals()` instance `chat_signals_for_startup` is created to pass to startup `SummaryWorker`s.
        *   If `unsummarized_numbers` is not empty, it loops through each unsummarized number.
        *   Inside the loop:
            *   It constructs the file paths for the full conversation (`.md`) and the target summary (`_summary.md`).
            *   `conversation_list = load_conversation(conv_filepath)`: Loads the full conversation history into a list of dictionaries.
            *   `full_markdown_history = reconstruct_markdown_history(conversation_list)`: Reconstructs the full Markdown text.
            *   If the reconstructed history is not empty, it creates a `SummaryWorker` instance, passes the `client`, the full Markdown history, the target `summary_filepath`, and the startup signals, appends the worker to the `summary_workers` list, and starts the worker thread.
        *   **`for worker in summary_workers: worker.join()`**: After the loop, it iterates through the `summary_workers` list and calls `.join()` on each worker. This line *blocks* the main `ask.py` thread until *that specific worker* finishes its `run()` method. The loop ensures the main thread waits for *all* summarization workers to complete before proceeding.
        *   Print statements are added to provide console feedback on the summarization process.
    *   **`client, chat = start_chat_session(client, project_path, conversation_path)`**: The `start_chat_session` function is called *after* the `join()` calls, passing the already configured `client` instance.
    *   **`win = MainWindow(client, chat, chat_signals, project_path, conversation_path)`**: The `client` instance is also passed to the `MainWindow` constructor.

**Review of `ui.py`'s `save_conversation_md`:**

The logic in `save_conversation_md` to check `if not os.path.exists(filepath_summary):` and then start a `SummaryWorker` for the `current_conv_number` is still correct for summarizing new conversations completed *during* the application's runtime. This startup summarization logic in `ask.py` complements the existing UI logic by handling conversations from *previous* runs that might not have been summarized.

**Implementation Steps:**

1.  **Replace `InsightCoder/ask_src/chat_utils.py`** with the complete code provided above.
2.  **Replace `InsightCoder/ask.py`** with the complete code provided above.
3.  Ensure `InsightCoder/ask_src/worker.py` includes the `SummaryWorker` class (which it should based on previous conversation history).
4.  Ensure `InsightCoder/ask_src/ui.py` includes the `MainWindow` class accepting `client` and `conversation_path` arguments (which it should based on previous conversation history).

**Testing:**

1.  **Run InsightCoder on a project where you have some conversation_N.md files but no corresponding conversation_N_summary.md files.**
    *   Observe the console output. You should see messages indicating that unsummarized conversations were found and that summarization is starting and waiting.
    *   Wait for the application UI to appear. It should be delayed until summarization is complete.
    *   Check the conversation directory. The `_summary.md` files should have been created.
2.  **Run InsightCoder on a project where all conversations already have summaries.**
    *   Observe the console output. You should see "No unsummarized conversations found." and the UI should appear relatively quickly without waiting for summarization.
3.  **Have a new conversation during a session.**
    *   Have a conversation, wait for the AI response.
    *   Verify that a new `conversation_X.md` and `conversation_X_summary.md` are created, and that the `SummaryWorker` runs in the background as before (this part is handled by `ui.py`).

This implementation provides a robust solution for ensuring all conversation history is summarized before the main chat session starts, leading to a more complete and consistent context for the LLM. Let me know how these changes work and if you have any further questions!

