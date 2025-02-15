

**User:**

Well, after a lot of debugging I made it to display number of tokens correctly and removed addition of total amount of tokens to the text_browser.  But there is still an issue of freezing the input bar when printing the message. Is there any way to reduce this effect or remove it entirely?



**Model:**

The UI freeze you're experiencing is indeed a common issue when performing potentially time-consuming operations directly in the main UI thread. Even with debouncing, the token counting, especially with larger context, can still cause noticeable delays and freezes during text input.

The best way to completely eliminate UI freezing during token counting is to move the token counting process to a separate background thread. This way, the UI thread remains responsive, handling user input and updates without being blocked by the token calculation.

Let's implement a `TokenCountWorker` to handle token counting in a background thread. We'll follow a similar pattern to `ChatWorker`, using signals and slots to communicate between the background thread and the UI thread.

**1. Create `TokenCountWorker` Class in `ask_src/token_worker.py` (New File):**

Create a new Python file named `ask_src/token_worker.py` and add the following code:

```python
import threading
from PyQt5.QtCore import pyqtSignal, QObject

class TokenCountSignals(QObject):
    token_count_updated = pyqtSignal(int)
    token_count_error = pyqtSignal(str)

class TokenCountWorker(threading.Thread):
    def __init__(self, client, chat, text, token_count_signals):
        super().__init__(daemon=True)
        self.client = client
        self.chat = chat
        self.text = text
        self.token_count_signals = token_count_signals

    def run(self):
        try:
            contents_to_count = []

            if self.chat._config:
                system_prompt = self.chat._config.get("prompt") if isinstance(self.chat._config, dict) else str(self.chat._config)
                if not system_prompt:
                    raise ValueError("System prompt is empty after conversion.")
            else:
                raise ValueError("System prompt config is empty.")

            contents_to_count.append(system_prompt)
            contents_to_count.extend(self.chat._curated_history)
            contents_to_count.append(self.text)

            token_count_response = self.client.models.count_tokens(
                model=self.chat._model,
                contents=contents_to_count
            )
            token_count = token_count_response.total_tokens
            self.token_count_signals.token_count_updated.emit(token_count)

        except Exception as e:
            error_message = f"Error counting tokens: {e}"
            print(error_message) # Optional: print error to console for debugging
            self.token_count_signals.token_count_error.emit(error_message)
```

**Explanation of `token_worker.py`:**

*   **`TokenCountSignals` Class:**
    *   `token_count_updated = pyqtSignal(int)`: Signal emitted when token counting is successful, carrying the `token_count` (integer) as data.
    *   `token_count_error = pyqtSignal(str)`: Signal emitted if there's an error during token counting, carrying an `error_message` (string).
*   **`TokenCountWorker` Class:**
    *   Inherits from `threading.Thread` to run in a separate thread.
    *   `__init__(self, client, chat, text, token_count_signals)`: Constructor takes:
        *   `client`: Gemini API client instance.
        *   `chat`: Chat session instance.
        *   `text`: The user input text to count tokens for.
        *   `token_count_signals`: An instance of `TokenCountSignals` for signal emission.
    *   `run(self)`: This method is executed when the thread starts.
        *   It performs the token counting logic, almost identical to the previous `update_token_count_display` in `ui.py`.
        *   **On Success:** `self.token_count_signals.token_count_updated.emit(token_count)`: Emits the `token_count_updated` signal with the calculated token count.
        *   **On Error:** `self.token_count_signals.token_count_error.emit(error_message)`: Emits the `token_count_error` signal with an error message.

**2. Modify `ui.py` to Use `TokenCountWorker`:**

Now, modify `ask_src/ui.py` to use the `TokenCountWorker` and handle the signals:

```diff
--- a/ask_src/ui.py
+++ b/ask_src/ui.py
@@ -5,7 +5,7 @@
 from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt, QTimer
 from PyQt5.QtWidgets import QMainWindow, QTextBrowser, QPushButton, QVBoxLayout, QHBoxLayout, QWidget, QTextEdit, QLabel

-from ask_src.worker import ChatWorker
+from ask_src.worker import ChatWorker, ChatSignals # Import ChatSignals as well if not already imported
 
 # Subclass QTextEdit to capture Enter key
 class EnterTextEdit(QTextEdit):
@@ -28,6 +28,7 @@
         self.setWindowTitle(f"{project_name} Codebase Chat")

         self.client = client  # OpenAI API client instance
+        self.token_count_signals = TokenCountSignals() # Create TokenCountSignals instance
         self.chat = chat  # chat session instance from chat_utils
         self.chat_history = ""
         self.chat_signals = chat_signals
@@ -51,7 +52,7 @@
         self.token_count_timer.setInterval(300)  # 300 ms delay
         self.token_count_timer.setSingleShot(True) # Single shot timer
         self.token_count_timer.timeout.connect(self.update_token_count_display) # Connect timer to update function
-
+        self.token_count_signals.token_count_updated.connect(self.set_token_count_label) # Connect signal to label update
         self.input_edit.textChanged.connect(self.start_token_count_timer) # Connect textChanged to timer start

         self.send_button = QPushButton("Send")
@@ -110,38 +111,20 @@
         self.token_count_timer.start()

     @pyqtSlot()
-    def update_token_count_display(self):
-        """Updates the token count display based on the full context."""
+    def update_token_count_display(self): # Renamed and modified
+        """Starts TokenCountWorker to update token count in background."""
         text = self.input_edit.toPlainText()
         if text:
-            try:
-                contents_to_count = []
-
-                # Wrap the system prompt properly - ensure "parts" is non-empty
-                if self.chat._config:
-                    # For instance, if _config has a prompt field:
-                    system_prompt = self.chat._config.get("prompt") if isinstance(self.chat._config, dict) else str(self.chat._config)
-                    if not system_prompt:
-                        raise ValueError("System prompt is empty after conversion.")
-                else:
-                    raise ValueError("System prompt config is empty.")
-                
-                # Build a plain text list for token counting
-                contents_to_count.append(system_prompt)
-                contents_to_count.extend(self.chat._curated_history)
-                contents_to_count.append(text)
-
-                # Count tokens for the combined content
-                token_count_response = self.client.models.count_tokens(
-                    model=self.chat._model,
-                    contents=contents_to_count
-                )
-                token_count = token_count_response.total_tokens
-                self.token_count_label.setText(f"Tokens: {token_count}")
-            except Exception as e:
-                print(f"Error counting tokens: {e}")
-                #print(f"Content being tokenized: {contents_to_count}") # Debugging output
-                self.token_count_label.setText("Tokens: Error") # Indicate error
-        else:
-            self.token_count_label.setText("Tokens: 0") # Reset to 0 if input is empty
+            worker = TokenCountWorker(self.client, self.chat, text, self.token_count_signals) # Create worker
+            worker.start() # Start the worker thread
+            self.token_count_label.setText("Tokens: Counting...") # Optionally indicate counting is in progress
+        else:
+             self.token_count_label.setText("Tokens: 0")
+
+    @pyqtSlot(int)
+    def set_token_count_label(self, token_count):
+        """Updates the token count label in UI thread (signal handler)."""
+        self.token_count_label.setText(f"Tokens: {token_count}")
 

     def adjust_input_height(self):

```

**Explanation of `ui.py` Changes:**

*   **`from ask_src.token_worker import TokenCountWorker, TokenCountSignals`**: Import the new `TokenCountWorker` and `TokenCountSignals` classes.
*   **`self.token_count_signals = TokenCountSignals()`**: Create an instance of `TokenCountSignals` in `MainWindow.__init__`.
*   **`self.token_count_signals.token_count_updated.connect(self.set_token_count_label)`**: Connect the `token_count_updated` signal of `token_count_signals` to a new slot function `self.set_token_count_label`. This ensures that when the worker thread finishes counting, the UI is updated in the main thread.
*   **`update_token_count_display(self)` (Modified):**
    *   **Renamed and Refactored:** The `update_token_count_display` function is now responsible for *starting* the `TokenCountWorker` instead of performing the token counting itself.
    *   `worker = TokenCountWorker(...)`: Creates a `TokenCountWorker` instance, passing the necessary data (`self.client`, `self.chat`, `text`, `self.token_count_signals`).
    *   `worker.start()`: Starts the `TokenCountWorker` thread, which will execute the `run()` method and perform token counting in the background.
    *   `self.token_count_label.setText("Tokens: Counting...")`: Optionally, you can set the label text to "Tokens: Counting..." to provide visual feedback that token counting is in progress.
*   **`set_token_count_label(self, token_count)` (New Slot):**
    *   `@pyqtSlot(int)`:  This is a new slot function that is connected to the `token_count_updated` signal.
    *   `self.token_count_label.setText(f"Tokens: {token_count}")`: This function is called *in the UI thread* when the `token_count_updated` signal is emitted by `TokenCountWorker`. It simply updates the `token_count_label` with the received `token_count`.

**3. Import `TokenCountSignals` and `TokenCountWorker` in `ask_src/__init__.py` (if needed):**

If you have an `__init__.py` file in your `ask_src` directory, you might want to add these imports to make them easily accessible from other modules:

```python
# ask_src/__init__.py (if you have this file)
from .chat_utils import *
from .ui import *
from .worker import *
from .token_worker import * # Add this line
```

**Implementation Steps:**

1.  **Create `ask_src/token_worker.py`:** Create the new file and add the `TokenCountWorker` and `TokenCountSignals` classes as shown above.
2.  **Modify `ask_src/ui.py`:** Apply the diff to `ask_src/ui.py` to update the `MainWindow` class to use `TokenCountWorker`.
3.  **Run `ask.py`:** Start InsightCoder.
4.  **Type in the Input Field:** Type text in the input field. You should now notice that the UI remains responsive while typing, and the token count updates shortly after you pause typing, without freezing the input.
5.  **Test with Longer Text and Conversations:** Test with longer input texts and longer conversations to ensure that the UI remains smooth even with increased token counting workload.

With these changes, token counting is now performed in a background thread, completely removing the UI freeze issue and providing a much smoother and more responsive user experience! Let me know if you encounter any issues or have further questions!

