import os
import re
import glob, time
import markdown
from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt, QTimer
from PyQt5.QtWidgets import QMainWindow, QTextBrowser, QPushButton, QVBoxLayout, QHBoxLayout, QWidget, QTextEdit, QLabel

from ask_src.worker import ChatWorker
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
    def __init__(self, client, chat, chat_signals, project_path="."):
        super().__init__()
        self.resize(1200, 800)

        # Dynamically set window title based on project path (default to "InsightCoder" if not specified)
        project_name = os.path.basename(os.path.abspath(project_path)) if project_path != "." else "InsightCoder"
        self.setWindowTitle(f"{project_name} Codebase Chat")

        self.client = client  # OpenAI API client instance
        self.token_count_signals = TokenCountSignals() # Create TokenCountSignals instance
        self.chat = chat  # chat session instance from chat_utils
        self.chat_history = ""
        self.chat_signals = chat_signals

        self.chat_signals.update_text.connect(self.update_chat_display)
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
        # self.input_edit.textChanged.connect(self.update_token_count_display) # Disconnect direct connection

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

        self.conversation_dir = os.path.join(project_path, "project_info", "conversations") # Directory to save conversations
        os.makedirs(self.conversation_dir, exist_ok=True) # Create directory if it doesn't exist

        # Set conversation_counter based on existing conversation files.
        pattern = os.path.join(self.conversation_dir, "conversation_*.md")
        existing = glob.glob(pattern)
        numbers = []
        for filepath in existing:
            basename = os.path.basename(filepath)
            match = re.search(r'conversation_(\d+)\.md', basename)
            if match:
                numbers.append(int(match.group(1)))
        self.conversation_counter = max(numbers) + 1 if numbers else 1

    @pyqtSlot(str, bool, str)
    def update_chat_display(self, html_text, final, final_md):
        self.text_browser.setHtml(html_text)
        self.text_browser.verticalScrollBar().setValue(self.text_browser.verticalScrollBar().maximum())

        if final:
            self.chat_history = final_md
            # self.save_conversation_html() # This is for debug only
            self.save_conversation_md()

    def save_conversation_html(self):
        """Saves the current conversation in QTextBrowser to an HTML file."""
        try:
            html_content = self.text_browser.toHtml() # Get HTML content from QTextBrowser
            filename = f"conversation_{self.conversation_counter}.html" # Generate filename
            filepath = os.path.join(self.conversation_dir, filename) # Create full file path

            with open(filepath, 'w', encoding='utf-8') as f: # Open file for writing
                f.write(html_content) # Write HTML content to the file

            print(f"Conversation saved to: {filepath}") # Optional: print confirmation to console
        except Exception as e:
            print(f"Error saving conversation: {e}") # Handle potential errors

    def save_conversation_md(self):
        """Saves the raw markdown conversation to a .md file."""
        try:
            filename = f"conversation_{self.conversation_counter}.md"
            filepath = os.path.join(self.conversation_dir, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(self.chat_history)
            print(f"Markdown conversation saved to: {filepath}")
        except Exception as e:
            print(f"Error saving markdown conversation: {e}")

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
        self.text_browser.setHtml(markdown.markdown(self.chat_history, extensions=["fenced_code", "codehilite", "nl2br"]))
        self.text_browser.verticalScrollBar().setValue(self.text_browser.verticalScrollBar().maximum())
        # Spawn ChatWorker later in main.py where worker.py is imported.
        
        worker = ChatWorker(user_msg, self.chat_history, self.chat_signals.update_text, self.chat)
        worker.start()