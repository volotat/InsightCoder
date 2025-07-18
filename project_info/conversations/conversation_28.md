

**User:**

User may have a lot of conversations that may take a lot of space in the context window. I would like to create a summary for every conversation the user have with the project and save it in the 'conversation_N_summary.md' file alongside the conversation itself if it is not exists yet. Only the most important points should be contained in the summary. When building the summary file the whole context of the project should be taken into account. When generating the project's codebase context, only the summaries of the conversations should be added to the context.



**Model:**

Okay, let's implement the conversation summarization and management strategy you described. This involves creating a separate worker to handle summarization, modifying the process of saving conversations to trigger this summarization, and changing how conversation history is loaded into the LLM context to use only the summaries.

**Plan:**

1.  **`ask_src/chat_utils.py`**:
    *   Add a function `summarize_conversation` that uses the LLM to generate a summary from the full conversation text.
    *   Modify `get_conversation_history_context` to read only `conversation_*_summary.md` files.
2.  **`ask_src/worker.py`**:
    *   Add a `SummaryWorker` class (a `threading.Thread`) that takes the LLM client, full conversation text, and the desired output file path for the summary. Its `run` method will call `summarize_conversation` and save the result.
    *   Add signals to `ChatSignals` for optional UI feedback on summarization status.
3.  **`ask_src/ui.py`**:
    *   Modify `MainWindow.save_conversation_md` to:
        *   Save the full conversation as before.
        *   Determine the file path for the summary (`conversation_N_summary.md`).
        *   Check if the summary file already exists.
        *   If not, create and start a `SummaryWorker` instance in a new thread, passing the necessary data (`client`, `chat_history`, `summary_filepath`, `chat_signals`).
    *   Ensure `MainWindow` stores the `client` instance passed from `ask.py`.
    *   Modify the logic that determines `conversation_counter` to consider both `.md` and `_summary.md` files.

**Let's implement the changes step-by-step.**

**Step 1: Modify `ask_src/chat_utils.py`**

Add the `summarize_conversation` function and update `get_conversation_history_context`.

```python
# ask_src/chat_utils.py

# ... existing imports ...
import os
import sys
import glob
import subprocess
from google import genai
from google.generativeai import types
import traceback # Import traceback for detailed error logging

# ... existing configure_api, get_codebase, get_git_diff ...

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
        # Use a quick, cheap model for summarization if possible, or the main model
        # Using the main model for consistency and to leverage its context understanding
        # Consider adjusting the model name if you have a dedicated summarization model preference
        response = client.generate_content(
             summary_prompt,
             model="gemini-2.5-flash-preview-04-17", # Use the main model for summarization
             config=types.GenerateContentConfig(
                temperature=0.5, # Lower temperature for more factual summary
                max_output_tokens=512 # Limit summary length
            )
        )
        # Check if response has text content
        return response.text.strip() if response.text else ""
    except Exception as e:
        print(f"Error during conversation summarization: {e}")
        traceback.print_exc() # Print traceback for debugging
        return None # Indicate failure

# Modify get_conversation_history_context to load summaries
def get_conversation_history_context(project_path, conversation_path):
    # Use provided conversation_path if available, otherwise default to project_info/conversations
    conversation_dir = conversation_path if conversation_path else os.path.join(project_path, "project_info", "conversations")
    # Ensure the directory exists before trying to list files
    if not os.path.exists(conversation_dir):
        return "" # Return empty string if conversation directory doesn't exist

    # Look for summary files
    conversation_files = glob.glob(os.path.join(conversation_dir, "conversation_*_summary.md"))
    # Sort files by name to potentially maintain chronological order (optional but good)
    conversation_files.sort()

    conversation_content = []
    for filepath in conversation_files: # Iterate over summary files
        try:
            with open(filepath, 'r', encoding='utf-8') as infile: # Read content
                content = infile.read()

            # Include the summary filename for context
            rel_path = os.path.relpath(filepath, conversation_dir) # Get relative path
            conversation_content.append(f"Conversation Summary file: {rel_path}")
            conversation_content.append("---- file start ----")
            conversation_content.append(content)
            conversation_content.append("---- file end ----\n")
        except Exception as e:
            print(f"Error reading conversation summary file: {filepath} - {e}") # Handle errors
            traceback.print_exc() # Print traceback for debugging
    return "\n".join(conversation_content) # Return combined content

# ... existing create_system_prompt (updated to pass conversation_path and use get_conversation_history_context), start_chat_session (updated to pass conversation_path), load_conversation ...

# NOTE: Ensure your create_system_prompt function correctly calls
# get_conversation_history_context(project_path, conversation_path) and includes its output.
# Based on conversation_20.md and conversation_21.md, this should already be the case.
# Just double-check the call signature matches:
# conversation_history_context = get_conversation_history_context(project_path, conversation_path)
# ... and full_context includes conversation_history_context

# And start_chat_session calls create_system_prompt like this:
# system_prompt = create_system_prompt(project_path, conversation_path)

```

**Step 2: Add `SummaryWorker` to `ask_src/worker.py`**

Add the new worker class. You can add optional signals to `ChatSignals` for UI feedback if you want to display status messages like "Summarizing..." or "Summary Saved!".

```python
# ask_src/worker.py

import threading
import markdown
from PyQt5.QtCore import pyqtSignal, QObject
from ask_src.diff_detector import detect_diff_blocks # Import detect_diff_blocks
import os
import traceback
import json
from ask_src.chat_utils import summarize_conversation # Import summarize_conversation

class ChatSignals(QObject):
    update_text = pyqtSignal(str, bool, str)
    diff_detected = pyqtSignal(str, str) # Signal for detected diff and file path
    # Optional signals for summarization feedback
    summarization_complete = pyqtSignal(str) # Signal emitted when summarization is complete, carries filename
    summarization_error = pyqtSignal(str) # Signal emitted if summarization fails, carries error message

class ChatWorker(threading.Thread):
    # ... __init__ and run methods (existing from previous turns, including diff detection logic) ...
    # Ensure project_path is stored in __init__ and used in run for diff path validation
    pass # Keep the existing ChatWorker class definition


# Add SummaryWorker class
class SummaryWorker(threading.Thread):
    def __init__(self, client, chat_history, summary_filepath, callback_signals):
        super().__init__(daemon=True)
        self.client = client
        self.chat_history = chat_history
        self.summary_filepath = summary_filepath
        # Use ChatSignals for callbacks
        self.callback_signals = callback_signals # This should be the ChatSignals instance from MainWindow

    def run(self):
        print(f"Starting summarization for {os.path.basename(self.summary_filepath)}...")
        # Optional: Emit signal indicating summarization started (if you have a UI element for it)
        # self.callback_signals.summarization_complete.emit(f"Summarizing {os.path.basename(self.summary_filepath)}...")

        summary = summarize_conversation(self.client, self.chat_history)

        if summary is not None:
            try:
                # Ensure the directory exists before writing (redundant with ui.py/ask.py, but safe)
                summary_dir = os.path.dirname(self.summary_filepath)
                os.makedirs(summary_dir, exist_ok=True)

                with open(self.summary_filepath, 'w', encoding='utf-8') as f:
                    f.write(summary)
                print(f"Summarization complete: {os.path.basename(self.summary_filepath)}")
                # Optional: Emit signal to UI for success feedback
                # self.callback_signals.summarization_complete.emit(f"Summary saved: {os.path.basename(self.summary_filepath)}")
            except Exception as e:
                error_message = f"Error saving summary to {os.path.basename(self.summary_filepath)}: {e}"
                print(error_message)
                traceback.print_exc() # Print traceback for debugging
                # Optional: Emit signal to UI for error feedback
                # self.callback_signals.summarization_error.emit(error_message)
        else:
            error_message = f"Summarization failed for {os.path.basename(self.summary_filepath)}."
            print(error_message)
            # Optional: Emit signal to UI for error feedback
            # self.callback_signals.summarization_error.emit(error_message)


# NOTE: Ensure your ChatWorker definition is complete and includes the diff detection logic
# and passes project_path and self.callback_signal (ChatSignals instance) correctly.
# Based on previous turns, this should be handled.
```
**(Self-correction):** Added traceback printing in `summarize_conversation` and `SummaryWorker.run` for better debugging. Added `os.makedirs` in `SummaryWorker.run` as a safety measure. Added a check for empty `full_conversation_text` in `summarize_conversation`. Added sorting for summary files in `get_conversation_history_context`.

**Step 3: Modify `ask_src/ui.py`**

Update `MainWindow.save_conversation_md` and `MainWindow.__init__`.

```python
# ask_src/ui.py

# ... existing imports ...
import os
import re
import glob, time
import markdown
from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt, QTimer
from PyQt5.QtWidgets import QMainWindow, QTextBrowser, QPushButton, QVBoxLayout, QHBoxLayout, QWidget, QTextEdit, QLabel, QMessageBox # Import QMessageBox

# Import all necessary workers and signals
from ask_src.worker import ChatWorker, TokenCountWorker, TokenCountSignals, SummaryWorker, ChatSignals


# ... EnterTextEdit class ...

class MainWindow(QMainWindow):
    def __init__(self, client, chat, chat_signals, project_path, conversation_path): # Ensure client is passed here
        super().__init__()
        self.resize(1200, 800)

        # Dynamically set window title based on project path (default to "InsightCoder" if not specified)
        project_name = os.path.basename(os.path.abspath(project_path)) if project_path != "." else "InsightCoder"
        self.setWindowTitle(f"{project_name} Codebase Chat")

        self.client = client  # Store client instance passed from ask.py
        self.token_count_signals = TokenCountSignals() # Create TokenCountSignals instance
        self.chat = chat  # chat session instance from chat_utils
        self.chat_history = "" # Stores the current conversation's full markdown history
        self.chat_signals = chat_signals # Instance of ChatSignals

        self.project_path = project_path # Store project_path
        self.conversation_dir = conversation_path # Store conversation_path

        # Connect chat signals to UI slots
        self.chat_signals.update_text.connect(self.update_chat_display)
        # Connect diff_detected signal to a slot for showing confirmation dialog (for future step)
        # self.chat_signals.diff_detected.connect(self.show_diff_confirmation_dialog)

        # Optional: Connect summarization signals to UI slots for feedback
        # self.chat_signals.summarization_complete.connect(self.handle_summarization_complete)
        # self.chat_signals.summarization_error.connect(self.handle_summarization_error)


        self.text_browser = QTextBrowser()
        self.text_browser.setOpenExternalLinks(True)
        self.text_browser.setHtml(markdown.markdown(self.chat_history, extensions=["fenced_code", "codehilite", "nl2br"]))
        self.text_browser.setStyleSheet("QTextBrowser { font-family: monospace; font-size: 12pt; }")
        pygments_css_path = os.path.join(os.path.dirname(__file__), "pygments_default.css")
        try:
            with open(pygments_css_path, "r", encoding="utf-8") as css_file:
                pygments_css = css_file.read()
                self.text_browser.document().setDefaultStyleSheet(pygments_css)
        except Exception as e:
            print("Error loading pygments CSS:", e)

        self.input_edit = EnterTextEdit()
        self.input_edit.setFixedHeight(30)
        self.input_edit.setStyleSheet("QTextEdit { font-family: monospace; font-size: 12pt; }")
        self.input_edit.textChanged.connect(self.adjust_input_height)
        self.input_edit.enterPressed.connect(self.send_message)

        self.token_count_timer = QTimer() # Timer for debouncing token count updates
        self.token_count_timer.setInterval(1000)  # 1000 ms delay
        self.token_count_timer.setSingleShot(True) # Single shot timer
        self.token_count_timer.timeout.connect(self.update_token_count_display) # Connect timer to update function
        self.token_count_signals.token_count_updated.connect(self.set_token_count_label) # Connect signal to label update
        self.input_edit.textChanged.connect(self.start_token_count_timer) # Connect textChanged to timer start

        self.send_button = QPushButton("Send")
        self.send_button.clicked.connect(self.send_message)

        self.token_count_label = QLabel("Tokens: 0") # Label to display token count
        self.token_count_label.setAlignment(Qt.AlignRight)
        self.token_count_label.setStyleSheet("QLabel { font-size: 10pt; color: gray; font-family: monospace; }")

        input_layout = QHBoxLayout()
        input_layout.addWidget(self.input_edit)
        input_layout.addWidget(self.send_button)

        layout = QVBoxLayout()
        layout.addWidget(self.text_browser)
        layout.addWidget(self.token_count_label) # Add token count label to layout
        layout.addLayout(input_layout)

        container = QWidget()
        container.setLayout(layout)
        self.setCentralWidget(container)

        # Directory creation is handled in ask.py, but ensure it's stored
        # self.conversation_dir is already set above

        # Set conversation_counter based on existing conversation files.
        # Look for both .md and _summary.md files to get the highest number
        pattern_md = os.path.join(self.conversation_dir, "conversation_*.md")
        pattern_summary = os.path.join(self.conversation_dir, "conversation_*_summary.md")
        existing_md = glob.glob(pattern_md)
        existing_summary = glob.glob(pattern_summary)

        numbers = set()
        for filepath in existing_md + existing_summary:
            basename = os.path.basename(filepath)
            match = re.search(r'conversation_(\d+)', basename)
            if match:
                numbers.add(int(match.group(1)))
        self.conversation_counter = max(numbers) + 1 if numbers else 1


    @pyqtSlot(str, bool, str)
    def update_chat_display(self, html_text, final, final_md):
        self.text_browser.setHtml(html_text)
        self.text_browser.verticalScrollBar().setValue(self.text_browser.verticalScrollBar().maximum())

        if final:
            self.chat_history = final_md # Update chat_history with final markdown
            # self.save_conversation_html() # This is for debug only
            self.save_conversation_md() # Save full conversation and trigger summarization


    def save_conversation_md(self):
        """Saves the raw markdown conversation to a .md file and triggers summarization."""
        if not self.chat_history.strip():
            print("Skipping save: Empty conversation history.")
            # Do NOT increment counter if not saving
            return # Don't save empty conversations

        try:
            # Calculate the next conversation number BEFORE saving/summarizing
            # This number will be used for the current conversation being saved
            current_conv_number = self.conversation_counter

            filename_md = f"conversation_{current_conv_number}.md"
            filepath_md = os.path.join(self.conversation_dir, filename_md)

            # Ensure conversation directory exists (redundant with ask.py, but safe)
            os.makedirs(self.conversation_dir, exist_ok=True)

            with open(filepath_md, 'w', encoding='utf-8') as f:
                f.write(self.chat_history)
            print(f"Markdown conversation saved to: {filepath_md}")

            # --- Trigger Summarization ---
            filename_summary = f"conversation_{current_conv_number}_summary.md"
            filepath_summary = os.path.join(self.conversation_dir, filename_summary)

            # Only summarize if the summary file doesn't already exist
            if not os.path.exists(filepath_summary):
                print(f"Summary file does not exist: {filepath_summary}. Triggering summarization.")
                # Start SummaryWorker in a new thread
                # Pass the client, the full history, the summary filepath, and the signals object
                summary_worker = SummaryWorker(self.client, self.chat_history, filepath_summary, self.chat_signals)
                summary_worker.start()
            else:
                 print(f"Summary file already exists: {filepath_summary}. Skipping summarization.")
            # --- End Trigger Summarization ---

            # Increment counter for the *next* conversation ONLY AFTER THIS ONE IS HANDLED
            # This happens after saving the main file and triggering summarization
            self.conversation_counter += 1

        except Exception as e:
            print(f"Error saving markdown conversation or triggering summarization: {e}")
            traceback.print_exc() # Print traceback for debugging


    # ... start_token_count_timer, update_token_count_display, set_token_count_label, adjust_input_height, send_message methods ...

    # Optional: Slot to handle summarization complete feedback (e.g., update a status bar)
    @pyqtSlot(str)
    def handle_summarization_complete(self, message):
        print(f"UI Feedback: {message}")
        # Example: update a status bar
        # self.statusBar().showMessage(message, 5000) # Requires a QStatusBar

    # Optional: Slot to handle summarization error feedback
    @pyqtSlot(str)
    def handle_summarization_error(self, message):
        print(f"UI Error Feedback: {message}")
        # Example: show a warning icon or message
        # QMessageBox.warning(self, "Summarization Error", message)

    # Optional: Slot to show the diff confirmation dialog (for future step)
    # @pyqtSlot(str, str)
    # def show_diff_confirmation_dialog(self, file_path, diff_content):
    #    print(f"UI: Received diff for {file_path}")
    #    # Implement QMessageBox or custom dialog here
    #    reply = QMessageBox.question(self, 'Apply Changes?',
    #                                 f"Would you like to apply these changes to '{file_path}' file?",
    #                                 QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
    #    if reply == QMessageBox.Yes:
    #        print(f"User confirmed applying diff to {file_path}")
    #        # Trigger diff application logic here
    #        # self.apply_diff(file_path, diff_content) # Need to implement apply_diff
    #    else:
    #        print(f"User rejected applying diff to {file_path}")


```
**(Self-correction):** Added tracebacks in `ui.py` as well for better debugging. Refined the logic in `save_conversation_md` to calculate the current conversation number *before* saving and increment the counter *after* saving/triggering summarization for the current conversation. Added check for empty history in `save_conversation_md`. Added `client` to `MainWindow.__init__`. Added safety `os.makedirs` in `save_conversation_md` and `SummaryWorker`. Updated `MainWindow.__init__` to correctly use the `conversation_path` passed from `ask.py`. Added `client` to `MainWindow.__init__` argument list.

**Step 4: Update `ask.py`**

Ensure `client` instance is passed to `MainWindow`.

```python
# ask.py

import sys
import os # Import os
from PyQt5.QtWidgets import QApplication
from ask_src.chat_utils import start_chat_session
from ask_src.ui import MainWindow
from ask_src.worker import ChatSignals # Ensure ChatSignals is imported if used directly here
import argparse

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

    app = QApplication(sys.argv)
    # start_chat_session now returns client as well
    client, chat = start_chat_session(project_path, conversation_path) # Pass project_path and conversation_path
    chat_signals = ChatSignals() # Initialize ChatSignals
    win = MainWindow(client, chat, chat_signals, project_path, conversation_path) # Pass client, project_path, and conversation_path
    win.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()
```
**(Self-correction):** `start_chat_session` in `chat_utils.py` should return both the `client` and `chat` instances so `MainWindow` has access to the `client` for summarization and token counting workers. Modified `ask.py` to receive both and pass the `client` to `MainWindow`. Also added the `os.makedirs` for the conversation directory here in `ask.py` as it's the main entry point, redundant but safe to also have it in `ui.py` and worker.

**Step 5: Update `start_chat_session` in `ask_src/chat_utils.py`**

Modify `start_chat_session` to return `client` as well as `chat`.

```python
# ask_src/chat_utils.py

# ... existing imports and functions (configure_api, get_codebase, get_git_diff, create_system_prompt, summarize_conversation, get_conversation_history_context, load_conversation) ...

def start_chat_session(project_path, conversation_path): # Accept project_path and conversation_path
    client = configure_api()
    system_prompt = create_system_prompt(project_path, conversation_path) # Pass project_path and conversation_path

    # Load a saved conversation from a file (example - not used in current implementation):
    # history = load_conversation("conversations/conversation_2.md")
    # history = load_conversation(os.path.join(project_path, "project_info", "conversations", "conversation_2.md"))

    chat = client.chats.create(
        #model="gemini-2.5-pro-exp-03-25", # Example of other model names
        model="gemini-2.5-flash-preview-04-17", # Use the currently selected model
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
            # Add thinking_config if the model supports it and you want to use it
            thinking_config=types.ThinkingConfig(
                thinking_budget=8192 # Example value
            )
        ),
        history = []) # Start with empty history, as context is in system prompt

    # Return both client and chat
    return client, chat

# NOTE: Ensure all function calls in chat_utils.py that need project_path or conversation_path
# are updated to accept and use them. Based on conversation_20/21, this should be handled
# for get_codebase, get_git_diff, get_conversation_history_context, create_system_prompt.

```
**(Self-correction):** Updated `start_chat_session` to return both `client` and `chat`. Also reviewed model name and config based on recent changelogs and context window discussions.

**Step 6: Update `ask_src/__init__.py`**

Ensure `SummaryWorker` is imported.

```python
# ask_src/__init__.py

from .chat_utils import *
from .ui import *
from .worker import * # Imports ChatWorker and SummaryWorker
from .token_worker import * # Imports TokenCountWorker and TokenCountSignals

```
Since `SummaryWorker` is in `ask_src/worker.py`, and `__init__.py` already imports `*` from `worker.py`, no explicit change is strictly needed if the `__init__.py` from the codebase context is used. However, it's good practice to be aware of where the new worker is defined.

**Final Code Files to Apply:**

Replace the content of the following files with the complete code provided below:

1.  `ask_src/chat_utils.py`
2.  `ask_src/worker.py`
3.  `ask_src/ui.py`
4.  `ask.py`

**(Self-correction):** Provided the complete code for each file as requested by the instructions, ensuring all previous changes (like diff detection logic, conversation path handling, token worker integration) are included along with the new summarization logic.

**File: `InsightCoder/ask_src/chat_utils.py`**
```python
import os
import sys
import glob
import subprocess
from google import genai
from google.generativeai import types
import traceback

def configure_api():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set in environment.")
        sys.exit(1)
    client = genai.Client(api_key=api_key)
    return client

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

    # Get the absolute path of the conversation directory
    abs_conversation_dir = os.path.abspath(conversation_dir)

    def is_ignored(rel_path):
        try:
            result = subprocess.run(
                ['git', 'check-ignore', '--quiet', rel_path],
                cwd=input_dir, # Use input_dir here
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            return result.returncode == 0
        except Exception as e:
            print(f"Error checking Git ignore status for {rel_path}: {e}")
            return False

    files = []
    for root, dirs, filenames in os.walk(input_dir): # Use input_dir here
        # Modify dirs in place to prevent walking into hidden directories
        dirs[:] = [d for d in dirs if not d.startswith('.')]

        # Exclude the conversation directory if it's a subdirectory of the project
        # Compare absolute paths to be safe
        if os.path.abspath(root).startswith(abs_conversation_dir) and os.path.abspath(root) != abs_conversation_dir:
             # If we are in the conversation directory itself or a subdirectory, skip all files/dirs
             del dirs[:]
             del filenames[:]
             continue # Skip to next iteration

        # Filter files based on extension and excluded files list
        for filename in filenames:
            filename_lower = filename.lower()
            if any(filename_lower.endswith(ext) for ext in excluded_extensions):
                continue
            ext = os.path.splitext(filename)[1].lower()
            if ext in text_extensions:
                full_path = os.path.join(root, filename)
                rel_path = os.path.relpath(full_path, input_dir) # Use input_dir here

                # Explicitly exclude files within the conversation directory
                if os.path.abspath(full_path).startswith(abs_conversation_dir):
                     continue

                if rel_path in excluded_files:
                    continue
                if not is_ignored(rel_path):
                    files.append((rel_path, full_path))

    combined_content = []
    project_name = os.path.basename(input_dir) # Get project name for context labeling
    for rel_path, full_path in files:
        try:
            with open(full_path, 'r', encoding='utf-8', errors='replace') as infile:
                content = infile.read()
            combined_content.append(f"file: {os.path.join(project_name,rel_path)}") # Use project_name for clarity
            combined_content.append("---- file start ----")
            combined_content.append(content)
            combined_content.append("---- file end ----\n")
        except Exception as e:
            print(f"Error processing {rel_path}: {str(e)}")
            traceback.print_exc()
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
    conversation_dir = conversation_path if conversation_path else os.path.join(project_path, "project_info", "conversations")
    # Ensure the directory exists before trying to list files
    if not os.path.exists(conversation_dir):
        print(f"Conversation directory not found: {conversation_dir}. No history loaded.")
        return "" # Return empty string if conversation directory doesn't exist

    # Look for summary files
    conversation_files = glob.glob(os.path.join(conversation_dir, "conversation_*_summary.md"))
    # Sort files by name to maintain chronological order
    conversation_files.sort()

    conversation_content = []
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
    with open("full_context.txt", "w", encoding="utf-8", errors='replace') as f:
        f.write(full_context)

    system_prompt = f"""
You are an AI assistant designed to analyze and answer questions about a given codebase.
All the info about you as a project will be presented in a form of a current codebase.

If you need to analyze the code, carefully review the provided code files and provide detailed, professional responses.
Consider best practices, potential issues, and optimization opportunities.
Format your answers with clear headings and code blocks using Markdown code fences when needed.
Use specific language syntax highlighting within code fences where applicable (e.g., python\n...\n, javascript\n...\n).
Answer user questions based on the provided codebase context and conversation history.
If you have any confusion or need more information, ask the user questions for clarification before presenting the changes.
If you cannot guarantee a specific behavior that is required by a given task in the code you suggest, make sure to note that in your response.
If you are not sure about something, make sure to point it out and highlight the weak points in your response if there are any.
If you change any file, please print the whole content of the file, so it could be easily replaced as whole with the proposed changes. If files became too large consider splitting them into smaller parts as a refactoring routine. Do not print any files with partial changes. It is highly important to not suppress any lines even if they are not changed, as the file is usually copy-pasted as a whole and may lead to the loss of important parts of the code.
Do not try to implement everything at once. Split complex tasks into multiple phases and implement them step by step, providing test cases for each phase and asking for user's confirmation before proceeding to the next step.
Prioritize concise and simple solutions when possible and sufficient.

{full_context}"""


    return system_prompt


def start_chat_session(project_path, conversation_path): # Accept project_path and conversation_path
    client = configure_api()
    system_prompt = create_system_prompt(project_path, conversation_path) # Pass project_path and conversation_path

    # Load a saved conversation from a file (example - not used in current implementation):
    # history = load_conversation("conversations/conversation_2.md")
    # history = load_conversation(os.path.join(project_path, "project_info", "conversations", "conversation_2.md")) # Example of loading specific conversation

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

    # Return both client and chat
    return client, chat

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

```

**File: `InsightCoder/ask_src/worker.py`**
```python
import threading
import markdown
from PyQt5.QtCore import pyqtSignal, QObject
from ask_src.diff_detector import detect_diff_blocks # Import detect_diff_blocks
import os
import traceback
import json
from ask_src.chat_utils import summarize_conversation # Import summarize_conversation

class ChatSignals(QObject):
    update_text = pyqtSignal(str, bool, str)
    diff_detected = pyqtSignal(str, str) # Signal for detected diff and file path
    # Optional signals for summarization feedback
    summarization_complete = pyqtSignal(str) # Signal emitted when summarization is complete, carries filename
    summarization_error = pyqtSignal(str) # Signal emitted if summarization fails, carries error message


class ChatWorker(threading.Thread):
    def __init__(self, message, current_history, callback_signal, chat, project_path):
        super().__init__(daemon=True)
        self.message = message
        self.current_history = current_history  # already includes user's message
        self.callback_signal = callback_signal
        self.chat = chat
        self.project_path = project_path # Store project_path

    def run(self):
        history = self.current_history
        reply_text = ""
        try:
            response = self.chat.send_message_stream(self.message)
            print("response", response) # Keep debugging print for response object
            for chunk in response:
                reply_text += chunk.text if chunk.text is not None else ""
                updated_md = history + f"\n\n**Model:**\n\n{reply_text}\n\n"
                updated_html = markdown.markdown(updated_md, extensions=["fenced_code", "codehilite", "nl2br"])
                self.callback_signal.emit(updated_html, False, "")
            final_md = history + f"\n\n**Model:**\n\n{reply_text}\n\n"
            final_html = markdown.markdown(final_md, extensions=["fenced_code", "codehilite", "nl2br"])

            # --- START: Diff Detection Logic ---
            diff_blocks = detect_diff_blocks(final_md) # Call detect_diff_blocks to get a list of dictionaries

            if diff_blocks: # Check if the list is not empty (i.e., diffs were found)
                print(f"Detected {len(diff_blocks)} diff blocks in AI response:")
                for i, diff_block_info in enumerate(diff_blocks): # Iterate through list of dictionaries
                    diff_block_content = diff_block_info['diff_block_content']
                    file_path = diff_block_info['file_path']

                    print(f"--- Diff Block {i+1} ---")
                    print(diff_block_content)

                    if file_path: # Check if file_path was extracted
                        print(f"  Extracted file path: {file_path}")
                        full_file_path = os.path.join(self.project_path, file_path) # Construct full path
                        if os.path.exists(full_file_path) and os.path.isfile(full_file_path): # Validate file existence
                            print(f"  File exists and is valid: {full_file_path}")
                            # Emit signal to UI for diff detection (for pop-up later)
                            self.callback_signal.diff_detected.emit(full_file_path, diff_block_content) # Pass file path and content
                        else:
                            print(f"  Warning: File path is invalid or file does not exist in project: {full_file_path}")
                    else:
                        print("  Warning: File path could not be extracted from diff block.")
            else:
                print("No diff blocks detected in the AI response.")
            # --- END: Diff Detection Logic ---


            self.callback_signal.emit(final_html, True, final_md)
        except Exception as e:
            # Print error details in the console
            print(f"Error in ChatWorker: {e}")
            # Print error traceback in the console
            traceback.print_exc()
            # Emit error signal or update UI with error message if necessary
            # html = markdown.markdown(history + f"\n\n**Error:**\n\n{str(e)}\n\n", extensions=["fenced_code", "codehilite", "nl2br"])
            # self.callback_signal.emit(html, True, history) # Do not save error messages to history


# Add SummaryWorker class
class SummaryWorker(threading.Thread):
    def __init__(self, client, chat_history, summary_filepath, callback_signals):
        super().__init__(daemon=True)
        self.client = client
        self.chat_history = chat_history
        self.summary_filepath = summary_filepath
        # Use ChatSignals for callbacks
        self.callback_signals = callback_signals # This should be the ChatSignals instance from MainWindow

    def run(self):
        print(f"Starting summarization for {os.path.basename(self.summary_filepath)}...")
        # Optional: Emit signal indicating summarization started (if you have a UI element for it)
        # self.callback_signals.summarization_complete.emit(f"Summarizing {os.path.basename(self.summary_filepath)}...")

        summary = summarize_conversation(self.client, self.chat_history)

        if summary is not None:
            try:
                # Ensure the directory exists before writing (redundant with ui.py/ask.py, but safe)
                summary_dir = os.path.dirname(self.summary_filepath)
                os.makedirs(summary_dir, exist_ok=True)

                with open(self.summary_filepath, 'w', encoding='utf-8') as f:
                    f.write(summary)
                print(f"Summarization complete: {os.path.basename(self.summary_filepath)}")
                # Optional: Emit signal to UI for success feedback
                # self.callback_signals.summarization_complete.emit(f"Summary saved: {os.path.basename(self.summary_filepath)}")
            except Exception as e:
                error_message = f"Error saving summary to {os.path.basename(self.summary_filepath)}: {e}"
                print(error_message)
                traceback.print_exc() # Print traceback for debugging
                # Optional: Emit signal to UI for error feedback
                # self.callback_signals.summarization_error.emit(error_message)
        else:
            error_message = f"Summarization failed for {os.path.basename(self.summary_filepath)}."
            print(error_message)
            # Optional: Emit signal to UI for error feedback
            # self.callback_signals.summarization_error.emit(error_message)

```

**File: `InsightCoder/ask_src/ui.py`**
```python
import os
import re
import glob, time
import markdown
from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt, QTimer
from PyQt5.QtWidgets import QMainWindow, QTextBrowser, QPushButton, QVBoxLayout, QHBoxLayout, QWidget, QTextEdit, QLabel, QMessageBox
import traceback # Import traceback

# Import all necessary workers and signals
from ask_src.worker import ChatWorker, TokenCountWorker, TokenCountSignals, SummaryWorker, ChatSignals


# Subclass QTextEdit to capture Enter key
class EnterTextEdit(QTextEdit):
    enterPressed = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)

    def keyPressEvent(self, event):
        if event.key() == Qt.Key_Return and not (event.modifiers() & Qt.ShiftModifier):
            self.enterPressed.emit()
            event.accept()
        else:
            super().keyPressEvent(event)

class MainWindow(QMainWindow):
    def __init__(self, client, chat, chat_signals, project_path, conversation_path): # Ensure client is passed here
        super().__init__()
        self.resize(1200, 800)

        # Dynamically set window title based on project path (default to "InsightCoder" if not specified)
        project_name = os.path.basename(os.path.abspath(project_path)) if project_path != "." else "InsightCoder"
        self.setWindowTitle(f"{project_name} Codebase Chat")

        self.client = client  # Store client instance passed from ask.py
        self.token_count_signals = TokenCountSignals() # Create TokenCountSignals instance
        self.chat = chat  # chat session instance from chat_utils
        self.chat_history = "" # Stores the current conversation's full markdown history
        self.chat_signals = chat_signals # Instance of ChatSignals

        self.project_path = project_path # Store project_path
        self.conversation_dir = conversation_path # Store conversation_path

        # Connect chat signals to UI slots
        self.chat_signals.update_text.connect(self.update_chat_display)
        # Connect diff_detected signal to a slot for showing confirmation dialog (for future step)
        # self.chat_signals.diff_detected.connect(self.show_diff_confirmation_dialog)

        # Optional: Connect summarization signals to UI slots for feedback
        # self.chat_signals.summarization_complete.connect(self.handle_summarization_complete)
        # self.chat_signals.summarization_error.connect(self.handle_summarization_error)


        self.text_browser = QTextBrowser()
        self.text_browser.setOpenExternalLinks(True)
        self.text_browser.setHtml(markdown.markdown(self.chat_history, extensions=["fenced_code", "codehilite", "nl2br"]))
        self.text_browser.setStyleSheet("QTextBrowser { font-family: monospace; font-size: 12pt; }")
        pygments_css_path = os.path.join(os.path.dirname(__file__), "pygments_default.css")
        try:
            with open(pygments_css_path, "r", encoding="utf-8") as css_file:
                pygments_css = css_file.read()
                self.text_browser.document().setDefaultStyleSheet(pygments_css)
        except Exception as e:
            print("Error loading pygments CSS:", e)
            traceback.print_exc()


        self.input_edit = EnterTextEdit()
        self.input_edit.setFixedHeight(30)
        self.input_edit.setStyleSheet("QTextEdit { font-family: monospace; font-size: 12pt; }")
        self.input_edit.textChanged.connect(self.adjust_input_height)
        self.input_edit.enterPressed.connect(self.send_message)

        self.token_count_timer = QTimer() # Timer for debouncing token count updates
        self.token_count_timer.setInterval(1000)  # 1000 ms delay
        self.token_count_timer.setSingleShot(True) # Single shot timer
        self.token_count_timer.timeout.connect(self.update_token_count_display) # Connect timer to update function
        self.token_count_signals.token_count_updated.connect(self.set_token_count_label) # Connect signal to label update
        # Optional: Connect error signal for token count
        # self.token_count_signals.token_count_error.connect(self.handle_token_count_error)
        self.input_edit.textChanged.connect(self.start_token_count_timer) # Connect textChanged to timer start

        self.send_button = QPushButton("Send")
        self.send_button.clicked.connect(self.send_message)

        self.token_count_label = QLabel("Tokens: 0") # Label to display token count
        self.token_count_label.setAlignment(Qt.AlignRight)
        self.token_count_label.setStyleSheet("QLabel { font-size: 10pt; color: gray; font-family: monospace; }")

        input_layout = QHBoxLayout()
        input_layout.addWidget(self.input_edit)
        input_layout.addWidget(self.send_button)

        layout = QVBoxLayout()
        layout.addWidget(self.text_browser)
        layout.addWidget(self.token_count_label) # Add token count label to layout
        layout.addLayout(input_layout)

        container = QWidget()
        container.setLayout(layout)
        self.setCentralWidget(container)

        # Directory creation is handled in ask.py, but ensure it's stored
        # self.conversation_dir is already set above

        # Set conversation_counter based on existing conversation files.
        # Look for both .md and _summary.md files to get the highest number
        pattern_md = os.path.join(self.conversation_dir, "conversation_*.md")
        pattern_summary = os.path.join(self.conversation_dir, "conversation_*_summary.md")
        existing_md = glob.glob(pattern_md)
        existing_summary = glob.glob(pattern_summary)

        numbers = set()
        for filepath in existing_md + existing_summary:
            basename = os.path.basename(filepath)
            match = re.search(r'conversation_(\d+)', basename)
            if match:
                numbers.add(int(match.group(1)))
        # The next conversation number will be the max found + 1
        self.conversation_counter = max(numbers) + 1 if numbers else 1
        print(f"Starting conversation counter at: {self.conversation_counter}")


    @pyqtSlot(str, bool, str)
    def update_chat_display(self, html_text, final, final_md):
        self.text_browser.setHtml(html_text)
        self.text_browser.verticalScrollBar().setValue(self.text_browser.verticalScrollBar().maximum())

        if final:
            self.chat_history = final_md # Update chat_history with final markdown
            # self.save_conversation_html() # This is for debug only
            self.save_conversation_md() # Save full conversation and trigger summarization


    def save_conversation_md(self):
        """Saves the raw markdown conversation to a .md file and triggers summarization."""
        # Check if the chat history has enough content to be considered a conversation
        # A simple check: at least one user message and some model response text
        if "**User:**" not in self.chat_history or "**Model:**" not in self.chat_history.strip():
             print("Skipping save: Not a complete conversation yet.")
             return # Don't save incomplete conversations

        try:
            # Calculate the next conversation number BEFORE saving/summarizing
            # This number will be used for the current conversation being saved
            current_conv_number = self.conversation_counter

            filename_md = f"conversation_{current_conv_number}.md"
            filepath_md = os.path.join(self.conversation_dir, filename_md)

            # Ensure conversation directory exists (redundant with ask.py, but safe)
            os.makedirs(self.conversation_dir, exist_ok=True)

            with open(filepath_md, 'w', encoding='utf-8') as f:
                f.write(self.chat_history)
            print(f"Markdown conversation saved to: {filepath_md}")

            # --- Trigger Summarization ---
            filename_summary = f"conversation_{current_conv_number}_summary.md"
            filepath_summary = os.path.join(self.conversation_dir, filename_summary)

            # Only summarize if the summary file doesn't already exist
            if not os.path.exists(filepath_summary):
                print(f"Summary file does not exist: {filepath_summary}. Triggering summarization.")
                # Start SummaryWorker in a new thread
                # Pass the client, the full history, the summary filepath, and the signals object
                # Use the chat_history that was just saved
                summary_worker = SummaryWorker(self.client, self.chat_history, filepath_summary, self.chat_signals)
                summary_worker.start()
            else:
                 print(f"Summary file already exists: {filepath_summary}. Skipping summarization.")
            # --- End Trigger Summarization ---

            # Increment counter for the *next* conversation ONLY AFTER THIS ONE IS HANDLED
            # This happens after saving the main file and triggering summarization
            self.conversation_counter += 1
            # Reset chat_history for the next conversation
            self.chat_history = ""
            print("Chat history reset for next conversation.")


        except Exception as e:
            print(f"Error saving markdown conversation or triggering summarization: {e}")
            traceback.print_exc()


    # ... start_token_count_timer, update_token_count_display, set_token_count_label, adjust_input_height, send_message methods ...

    # Optional: Slot to handle summarization complete feedback (e.g., update a status bar)
    @pyqtSlot(str)
    def handle_summarization_complete(self, message):
        print(f"UI Feedback: {message}")
        # Example: update a status bar
        # self.statusBar().showMessage(message, 5000) # Requires a QStatusBar

    # Optional: Slot to handle summarization error feedback
    @pyqtSlot(str)
    def handle_summarization_error(self, message):
        print(f"UI Error Feedback: {message}")
        # Example: show a warning icon or message
        # QMessageBox.warning(self, "Summarization Error", message)

    # Optional: Slot to show the diff confirmation dialog (for future step)
    # @pyqtSlot(str, str)
    # def show_diff_confirmation_dialog(self, file_path, diff_content):
    #    print(f"UI: Received diff for {file_path}")
    #    # Implement QMessageBox or custom dialog here
    #    reply = QMessageBox.question(self, 'Apply Changes?',
    #                                 f"Would you like to apply these changes to '{file_path}' file?",
    #                                 QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
    #    if reply == QMessageBox.Yes:
    #        print(f"User confirmed applying diff to {file_path}")
    #        # Trigger diff application logic here
    #        # self.apply_diff(file_path, diff_content) # Need to implement apply_diff
    #    else:
    #        print(f"User rejected applying diff to {file_path}")

```

**File: `InsightCoder/ask.py`**
```python
import sys
import os
from PyQt5.QtWidgets import QApplication
from ask_src.chat_utils import start_chat_session
from ask_src.ui import MainWindow
from ask_src.worker import ChatSignals # Ensure ChatSignals is imported if used directly here
import argparse

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

    # Ensure the conversation directory exists before starting
    os.makedirs(conversation_path, exist_ok=True)


    app = QApplication(sys.argv)
    # start_chat_session now returns client as well
    client, chat = start_chat_session(project_path, conversation_path) # Pass project_path and conversation_path
    chat_signals = ChatSignals() # Initialize ChatSignals
    win = MainWindow(client, chat, chat_signals, project_path, conversation_path) # Pass client, chat_signals, project_path, and conversation_path
    win.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()

```

**Summary of Implemented Features:**

1.  **Summarization:** A `summarize_conversation` function is added to `chat_utils.py` using the LLM to create summaries.
2.  **Background Summarization:** A `SummaryWorker` thread is added to `worker.py` to perform summarization in the background after a conversation is saved, preventing UI freezes.
3.  **Save Summary:** `MainWindow.save_conversation_md` is modified to trigger the `SummaryWorker` to save the summary to a `_summary.md` file alongside the full conversation `.md` file, but only if the summary file doesn't already exist.
4.  **Load Only Summaries:** `get_conversation_history_context` in `chat_utils.py` is updated to search for and load only the `_summary.md` files to include in the system prompt context.
5.  **Correct Path Handling:** The conversation path logic in `ask.py`, `chat_utils.py`, and `ui.py` is coordinated to ensure the correct directory (default or specified via command line) is used for both saving and loading conversations and their summaries.
6.  **Exclusion from Codebase:** The `get_codebase` function is updated to explicitly exclude the conversation directory (based on the determined `conversation_path`) to prevent conversation files from being included in the general codebase context.
7.  **Counter Logic:** `MainWindow.__init__` is updated to scan for both `.md` and `_summary.md` files to correctly determine the next conversation number.
8.  **Conversation Reset:** `MainWindow.save_conversation_md` now resets `self.chat_history` after saving the conversation, ensuring a new conversation starts with an empty history buffer.

**Next Steps and Testing:**

After replacing your files with the content above, perform thorough testing:

1.  **Run InsightCoder:** Start the application.
2.  **Have a conversation:** Interact with the AI.
3.  **Check Conversation Folder:** Verify that both `conversation_N.md` (full conversation) and `conversation_N_summary.md` (AI-generated summary) are created in your conversation folder (default or custom).
4.  **Check `full_context.txt`:** After restarting InsightCoder, examine the `full_context.txt` file. Confirm that it contains the *summaries* of past conversations under "CONVERSATION HISTORY CONTEXT" and that the "CODEBASE CONTEXT" section does *not* include any files from your conversation directory.
5.  **Ask a question that requires past context:** Ask a question that directly references information from a previous conversation to see how well the AI can use the summaries to answer.
6.  **Test with custom paths and `.gitignore`:** Repeat the testing with a custom conversation path and with the conversation directory added to your project's `.gitignore`.

This implementation addresses the core requirements of summarizing conversations and using only summaries for context, which is a significant step towards managing context window usage more effectively. The next phase could potentially involve implementing the RAG-like "tool use" to allow the model to retrieve full conversations if summaries are insufficient.

