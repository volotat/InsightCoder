

**User:**

Let's add the button that updates the current context for code of the project while keeping the conversation between user and the model intact.



**Model:**

Of course. Adding a button to refresh the codebase context without losing the ongoing conversation is an excellent feature for keeping the AI's knowledge up-to-date with your latest code changes.

Here is a step-by-step plan to implement this feature:

1.  **Add a "Reload Context" button** to the UI next to the "Send" button.
2.  **Create a background worker (`ContextReloadWorker`)** to handle the reloading process. This is crucial to prevent the UI from freezing, as reading the entire codebase can take a few moments.
3.  The worker will generate a new system prompt by re-analyzing the entire project, including any new file changes and git diffs.
4.  It will then create a **new chat session** instance with this updated context, while carefully **preserving the full history** from the current conversation.
5.  Finally, the UI will swap the old chat session with the new, updated one. You will be able to continue your conversation with the AI now having full knowledge of your latest changes.

Here are the necessary code modifications:

### Step 1: Update Worker and Signals

First, we'll define a new signal for when the context is reloaded and create the `ContextReloadWorker` that will do the heavy lifting in the background.

```python
# file: ask_src/worker.py

import threading
import markdown
from PyQt5.QtCore import pyqtSignal, QObject
from ask_src.diff_detector import detect_diff_blocks # Import detect_diff_blocks
import os
import traceback
import json
from google.genai import types # Add this import
# Add create_system_prompt to imports
from ask_src.chat_utils import summarize_conversation, create_system_prompt

class ChatSignals(QObject):
    update_text = pyqtSignal(str, bool, str) 
    context_reloaded = pyqtSignal(object) # Signal for when the context reload is complete
    #diff_detected = pyqtSignal(str, str) # Signal for detected diff and file path
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
            print("response", response)
            for chunk in response:
                reply_text += chunk.text if chunk.text is not None else ""
                updated_md = history + f"\n\n**Model:**\n\n{reply_text}\n\n"
                updated_html = markdown.markdown(
                    updated_md,
                    extensions=["fenced_code", "codehilite", "nl2br"],
                    extension_configs={'codehilite': {'guess_lang': False}}
                )
                self.callback_signal.emit(updated_html, False, "")
            final_md = history + f"\n\n**Model:**\n\n{reply_text}\n\n"
            final_html = markdown.markdown(
                final_md,
                extensions=["fenced_code", "codehilite", "nl2br"],
                extension_configs={'codehilite': {'guess_lang': False}}
            )

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
                        else:
                            print(f"  Warning: File path is invalid or file does not exist in project: {full_file_path}")
                    else:
                        print("  Warning: File path could not be extracted from diff block.")
            else:
                print("No diff blocks detected in the AI response.")

            self.callback_signal.emit(final_html, True, final_md)
        except Exception as e:
            # Print error details in the console
            print(f"Error in ChatWorker: {e}")
            # Print error traceback in the console
            traceback.print_exc()
            # Do not change the chat's HTML; emit the existing history unchanged
            #html = markdown.markdown(history, extensions=["fenced_code", "codehilite", "nl2br"])
            #self.callback_signal.emit(html, True, history)

# --- Start: New ContextReloadWorker class ---
class ContextReloadWorker(threading.Thread):
    def __init__(self, client, project_path, conversation_path, current_history, callback_signal):
        super().__init__(daemon=True)
        self.client = client
        self.project_path = project_path
        self.conversation_path = conversation_path
        self.current_history = current_history
        self.callback_signal = callback_signal

    def run(self):
        try:
            print("ContextReloadWorker: Starting context reload...")
            system_prompt = create_system_prompt(self.project_path, self.conversation_path)
            
            # This logic for creating a chat session is duplicated from chat_utils.start_chat_session.
            # This could be refactored into a shared helper function in the future.
            new_chat = self.client.chats.create(
                model="gemini-2.5-pro",
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=1,
                    top_p=0.95,
                    top_k=64,
                    max_output_tokens=65536,
                    response_mime_type="text/plain",
                ),
                history=self.current_history
            )
            print("ContextReloadWorker: New chat session created. Emitting signal.")
            self.callback_signal.emit(new_chat)
        except Exception as e:
            print(f"Error in ContextReloadWorker: {e}")
            traceback.print_exc()
            # In a future step, we could add an error signal to inform the UI.
            self.callback_signal.emit(None) # Emit None on error
# --- End: New ContextReloadWorker class ---


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

### Step 2: Integrate the Button and Logic into the UI

Now, let's modify the `MainWindow` to include the new button and the logic to handle the context reloading process.

```python
# file: ask_src/ui.py

import os
import re
import glob, time
import markdown
from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt, QTimer
from PyQt5.QtWidgets import QMainWindow, QPushButton, QVBoxLayout, QHBoxLayout, QWidget, QTextEdit, QLabel
from PyQt5.QtWebEngineWidgets import QWebEngineView

# Import all necessary workers and signals, including the new ContextReloadWorker
from ask_src.worker import ChatWorker, SummaryWorker, ChatSignals, ContextReloadWorker
from ask_src.token_worker import TokenCountWorker, TokenCountSignals

# --- Welcome Message Constant ---
WELCOME_MESSAGE = """
# Welcome to InsightCoder

Your AI-powered codebase analysis assistant.

**⚠️ Important Privacy Notice**: This tool sends your project's source code to an external LLM service for analysis. **Do not use this tool on repositories containing personal, confidential, or sensitive information.**

### How to get started:

1.  Ask a question about your codebase in the text box below.
2.  Use `Shift+Enter` for a new line in the input box.
3.  Press `Enter` to send your message.

### Example Prompts:

*   "Describe the overall architecture of this project."
*   "Explain the `ChatWorker` class in `ask_src/worker.py`."
*   "Suggest refactoring strategies for `ask_src/ui.py`."

*This message will be replaced by your conversation history once you send your first message.*
"""


# Subclass QTextEdit to capture Enter key
class EnterTextEdit(QTextEdit):
    enterPressed = pyqtSignal()  # declare signal here

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
        self.chat_history = WELCOME_MESSAGE # Start with the welcome message
        self.conversation_started = False # Flag to track if conversation has begun
        self.chat_signals = chat_signals # Instance of ChatSignals

        self.project_path = project_path # Store project_path
        self.conversation_dir = conversation_path # Store conversation_path

        # Connect chat signals to UI slots
        self.chat_signals.update_text.connect(self.update_chat_display)
        self.chat_signals.context_reloaded.connect(self.on_context_reloaded) # Connect the new signal
        # self.chat_signals.diff_detected.connect(self.show_diff_confirmation_dialog)

        # Optional: Connect summarization signals to UI slots for feedback
        # self.chat_signals.summarization_complete.connect(self.handle_summarization_complete)
        # self.chat_signals.summarization_error.connect(self.handle_summarization_error)


        self.web_view = QWebEngineView()
        self.web_view.page().profile().setHttpAcceptLanguage("en-us")

        # Load Pygments CSS and base styles once
        self.html_style = ""
        pygments_css_path = os.path.join(os.path.dirname(__file__), "pygments_default.css")
        try:
            with open(pygments_css_path, "r", encoding="utf-8") as css_file:
                self.html_style = f"""
                    body {{ 
                        font-family: monospace; 
                        font-size: 12pt; 
                        background-color: #fdfdfd; 
                    }}
                    {css_file.read()}
                """
        except Exception as e:
            print("Error loading pygments CSS:", e)
            self.html_style = "body { font-family: monospace; font-size: 12pt; }"

        # Set initial content (the welcome page)
        initial_html_body = markdown.markdown(
            self.chat_history,
            extensions=["fenced_code", "codehilite", "nl2br"],
            extension_configs={'codehilite': {'guess_lang': False}}
        )
        self.update_chat_display(initial_html_body, False, "") # Use the update method to apply styles

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

        # --- Start: Add reload button ---
        self.reload_button = QPushButton("Reload Context")
        self.reload_button.clicked.connect(self.reload_codebase_context)
        # --- End: Add reload button ---

        self.token_count_label = QLabel("Tokens: 0") # Label to display token count
        self.token_count_label.setAlignment(Qt.AlignRight)
        self.token_count_label.setStyleSheet("QLabel { font-size: 10pt; color: gray; font-family: monospace; }")

        input_layout = QHBoxLayout()
        input_layout.addWidget(self.input_edit)
        input_layout.addWidget(self.send_button)
        input_layout.addWidget(self.reload_button) # Add button to layout

        layout = QVBoxLayout()
        layout.addWidget(self.web_view, 1)
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

    # --- Start: Add context reload methods ---
    def reload_codebase_context(self):
        """Triggers the context reloading process in a background thread."""
        print("UI: Reload context button clicked.")
        self.reload_button.setEnabled(False)
        self.send_button.setEnabled(False)
        self.input_edit.setEnabled(False)
        self.token_count_label.setText("Reloading codebase context...")

        # The history is managed by the chat object itself
        current_history = self.chat.history

        worker = ContextReloadWorker(
            self.client, 
            self.project_path, 
            self.conversation_dir, 
            current_history, 
            self.chat_signals.context_reloaded
        )
        worker.start()

    @pyqtSlot(object)
    def on_context_reloaded(self, new_chat_object):
        """Handles the completion of the context reloading process."""
        print("UI: Context reloaded signal received.")
        self.reload_button.setEnabled(True)
        self.send_button.setEnabled(True)
        self.input_edit.setEnabled(True)

        if new_chat_object:
            self.chat = new_chat_object
            self.token_count_label.setText("Context reloaded successfully.")
            # After 3 seconds, update the token count, which will replace the message.
            QTimer.singleShot(3000, self.start_token_count_timer)
        else:
            # Handle error case
            self.token_count_label.setText("Error: Failed to reload context.")

    # --- End: Add context reload methods ---

    @pyqtSlot(str, bool, str)
    def update_chat_display(self, html_body, final, final_md):
        full_html = f"""
        <html>
        <head>
            <style>{self.html_style}</style>
        </head>
        <body>
            {html_body}
        </body>
        </html>
        """
        self.web_view.setHtml(full_html)
        # Use a timeout to ensure the scroll happens after the DOM update
        if self.conversation_started: # Only auto-scroll if conversation is active
             self.web_view.page().runJavaScript("setTimeout(function() {{ window.scrollTo(0, document.body.scrollHeight); }}, 100);")


        if final:
            self.chat_history = final_md # Update chat_history with final markdown
            # self.save_conversation_html() # This is for debug only
            self.save_conversation_md() # Save full conversation and trigger summarization

    def save_conversation_html(self):
        """Saves the current conversation to an HTML file for debugging."""
        def save_html_callback(html_content):
            try:
                # Use the same counter as the .md file for consistency
                current_conv_number = self.conversation_counter
                filename = f"conversation_{current_conv_number}.html"
                filepath = os.path.join(self.conversation_dir, filename)

                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(html_content)

                print(f"Conversation HTML (debug) saved to: {filepath}")
            except Exception as e:
                print(f"Error saving conversation HTML: {e}")

        # page().toHtml() is asynchronous. It takes a callback function.
        self.web_view.page().toHtml(save_html_callback)

    def save_conversation_md(self):
        """Saves the raw markdown conversation to a .md file and triggers summarization."""
        if not self.chat_history.strip() or not self.conversation_started:
            print("Skipping save: Empty or initial conversation history.")
            return # Don't save empty conversations or the welcome page

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

        except Exception as e:
            print(f"Error saving markdown conversation or triggering summarization: {e}")
            traceback.print_exc() # Print traceback for debugging

    @pyqtSlot()
    def start_token_count_timer(self):
        """Starts the token count timer, debouncing the update."""
        self.token_count_timer.start()

    @pyqtSlot()
    def update_token_count_display(self): # Renamed and modified
        """Starts TokenCountWorker to update token count in background."""
        text = self.input_edit.toPlainText()

        worker = TokenCountWorker(self.client, self.chat, text, self.token_count_signals) # Create worker
        worker.start() # Start the worker thread
        self.token_count_label.setText("Tokens: Counting...") # Optionally indicate counting is in progress

    @pyqtSlot(int)
    def set_token_count_label(self, token_count):
        """Updates the token count label in UI thread (signal handler)."""
        self.token_count_label.setText(f"Tokens: {token_count}")

    def adjust_input_height(self):
        doc_height = self.input_edit.document().size().height()
        new_height = min(100, doc_height + 10)
        self.input_edit.setFixedHeight(int(new_height))

    def send_message(self):
        user_msg = self.input_edit.toPlainText().strip()
        if not user_msg:
            return

        # If this is the first message, clear the welcome screen.
        if not self.conversation_started:
            self.chat_history = ""
            self.conversation_started = True

        self.input_edit.clear()
        self.chat_history += f"\n\n**User:**\n\n{user_msg}\n\n"
        html_body = markdown.markdown(
            self.chat_history,
            extensions=["fenced_code", "codehilite", "nl2br"],
            extension_configs={'codehilite': {'guess_lang': False}}
        )
        self.update_chat_display(html_body, False, "")

        worker = ChatWorker(user_msg, self.chat_history, self.chat_signals.update_text, self.chat, self.project_path)
        worker.start()

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
```

These changes will add the desired functionality. Let me know if you would like to proceed with applying them.

