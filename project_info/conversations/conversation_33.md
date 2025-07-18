

**User:**

Let's use QWebEngineView to render markdown in a more robust way.



**Model:**

Of course. Using `QWebEngineView` for rendering is an excellent idea, as it provides a much more robust and modern engine for displaying HTML and CSS compared to `QTextBrowser`. This will ensure the markdown, especially with syntax highlighting, looks exactly as intended.

Before we proceed, I've noticed a potential issue in the provided codebase context. The unstaged changes show that the line `self.conversation_counter += 1` was removed from the `save_conversation_md` method in `ask_src/ui.py`. Without this line, every conversation saved within a single session of the application would attempt to use the same file number, causing them to overwrite each other.

To prevent this bug, my proposed solution includes restoring this line. Please let me know if this was an intentional change for a different reason.

Here are the step-by-step changes to integrate `QWebEngineView`:

### Phase 1: Update Dependencies and UI

#### Step 1: Add `PyQtWebEngine` to Requirements

First, we need to add the necessary dependency for `QWebEngineView`.

**File:** `InsightCoder/requirements.txt`
```diff
--- a/InsightCoder/requirements.txt
+++ b/InsightCoder/requirements.txt
@@ -1,4 +1,5 @@
 PyQt5
+PyQtWebEngine
 google-generativeai
 markdown
 Pygments

```

After updating this file, please remember to run `pip install -r requirements.txt` to install the new package.

#### Step 2: Replace `QTextBrowser` with `QWebEngineView` in the UI

Next, I'll modify `ask_src/ui.py` to use `QWebEngineView`. This involves replacing the widget, changing how CSS is applied, and updating the logic for scrolling and setting content. I've also re-included the conversation counter increment.

**File:** `InsightCoder/ask_src/ui.py`
```python
import os
import re
import glob, time
import markdown
from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt, QTimer
from PyQt5.QtWidgets import QMainWindow, QPushButton, QVBoxLayout, QHBoxLayout, QWidget, QTextEdit, QLabel
from PyQt5.QtWebEngineWidgets import QWebEngineView

# Import all necessary workers and signals
from ask_src.worker import ChatWorker, SummaryWorker, ChatSignals
from ask_src.token_worker import TokenCountWorker, TokenCountSignals

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

        # Set initial content
        initial_html_body = markdown.markdown(self.chat_history, extensions=["fenced_code", "codehilite", "nl2br"])
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

        self.token_count_label = QLabel("Tokens: 0") # Label to display token count
        self.token_count_label.setAlignment(Qt.AlignRight)
        self.token_count_label.setStyleSheet("QLabel { font-size: 10pt; color: gray; font-family: monospace; }")

        input_layout = QHBoxLayout()
        input_layout.addWidget(self.input_edit)
        input_layout.addWidget(self.send_button)

        layout = QVBoxLayout()
        layout.addWidget(self.web_view)
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
            self.conversation_counter += 1

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
        self.input_edit.clear()
        self.chat_history += f"\n\n**User:**\n\n{user_msg}\n\n"
        html_body = markdown.markdown(self.chat_history, extensions=["fenced_code", "codehilite", "nl2br"])
        self.update_chat_display(html_body, False, "")
        # Spawn ChatWorker later in main.py where worker.py is imported.
        
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

### Summary of Changes

*   **`requirements.txt`**: Added `PyQtWebEngine` for `QWebEngineView` support.
*   **`ask_src/ui.py`**:
    *   Replaced `QTextBrowser` with `QWebEngineView` for superior HTML/CSS rendering.
    *   CSS is now loaded once and embedded directly into the HTML for each update.
    *   Scrolling to the bottom is now handled with a short Javascript snippet.
    *   **Bug Fix:** Restored the `self.conversation_counter += 1` logic to prevent conversations in the same session from overwriting each other.
*   **Testing**: Please note that the existing tests in `tests/test_conversation_folder.py` instantiate `MainWindow`. They may fail due to the new `PyQtWebEngine` dependency and might require adjustments to the test setup.

Once you confirm these changes, I can proceed with any further steps.



**User:**

We also need some welcome page appeared before the conversation is started.



**Model:**

Of course. Adding a welcome page is a great way to improve the user experience on startup. It can provide essential information and example prompts before the user begins their conversation.

I will implement this by displaying a default welcome message in the `QWebEngineView`. This message will be automatically replaced by the conversation history as soon as the user sends their first message.

Here are the changes for `ask_src/ui.py`:

### `ask_src/ui.py` Modifications

I will add a `WELCOME_MESSAGE` constant and modify the `__init__` and `send_message` methods to handle the display logic. A new flag, `self.conversation_started`, will track whether the initial message has been sent.

```python
import os
import re
import glob, time
import markdown
from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt, QTimer
from PyQt5.QtWidgets import QMainWindow, QPushButton, QVBoxLayout, QHBoxLayout, QWidget, QTextEdit, QLabel
from PyQt5.QtWebEngineWidgets import QWebEngineView

# Import all necessary workers and signals
from ask_src.worker import ChatWorker, SummaryWorker, ChatSignals
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
        # Connect diff_detected signal to a slot for showing confirmation dialog (for future step)
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
        initial_html_body = markdown.markdown(self.chat_history, extensions=["fenced_code", "codehilite", "nl2br"])
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

        self.token_count_label = QLabel("Tokens: 0") # Label to display token count
        self.token_count_label.setAlignment(Qt.AlignRight)
        self.token_count_label.setStyleSheet("QLabel { font-size: 10pt; color: gray; font-family: monospace; }")

        input_layout = QHBoxLayout()
        input_layout.addWidget(self.input_edit)
        input_layout.addWidget(self.send_button)

        layout = QVBoxLayout()
        layout.addWidget(self.web_view)
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

            # Increment counter for the *next* conversation ONLY AFTER THIS ONE IS HANDLED
            self.conversation_counter += 1

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
        html_body = markdown.markdown(self.chat_history, extensions=["fenced_code", "codehilite", "nl2br"])
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

### Summary of Changes

1.  **Welcome Message**: A `WELCOME_MESSAGE` constant is defined with helpful text for the user.
2.  **Initial State**: `MainWindow` now initializes with `self.chat_history` set to the welcome message and `self.conversation_started` set to `False`. The UI will render this message on startup.
3.  **First Interaction**: The `send_message` method now checks the `self.conversation_started` flag. On the first send, it clears the welcome message from `self.chat_history` before appending the user's query and sets the flag to `True`.
4.  **Save Logic**: The `save_conversation_md` method is updated to not save the initial welcome message.
5.  **Scrolling**: Auto-scrolling is now disabled for the welcome page to ensure the user sees the top of the message.

This provides a clean and professional entry point into the application. Let me know if you'd like any other adjustments.

