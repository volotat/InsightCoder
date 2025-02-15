

**User:**

Okey. It seems to be working, but the amount of tokens displayed only considers the current text written instead of the whole context that is going to be sent to the model. Also the calculation should be much more sparse as the current implementation slows down the text input.



**Model:**

You've pinpointed critical issues with the current token counter: it's both inaccurate in scope and detrimental to UI performance. Let's rectify these problems by expanding the token counting to encompass the full context and implementing debouncing to improve responsiveness.

Here are the modifications to `ask_src/ui.py`:

```diff
--- a/ask_src/ui.py
+++ b/ask_src/ui.py
@@ -2,7 +2,7 @@
 import os
 import re
 import glob, time
-import markdown
+import markdown, time
 from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt, QTimer
 from PyQt5.QtWidgets import QMainWindow, QTextBrowser, QPushButton, QVBoxLayout, QHBoxLayout, QWidget, QTextEdit, QLabel

@@ -54,7 +54,14 @@
         self.input_edit.setStyleSheet("QTextEdit { font-family: monospace; font-size: 12pt; }")
         self.input_edit.textChanged.connect(self.adjust_input_height)
         self.input_edit.enterPressed.connect(self.send_message)
-        self.input_edit.textChanged.connect(self.update_token_count_display) # Connect textChanged signal
+        # self.input_edit.textChanged.connect(self.update_token_count_display) # Disconnect direct connection
+
+        self.token_count_timer = QTimer() # Timer for debouncing token count updates
+        self.token_count_timer.setInterval(300)  # 300 ms delay
+        self.token_count_timer.setSingleShot(True) # Single shot timer
+        self.token_count_timer.timeout.connect(self.update_token_count_display) # Connect timer to update function
+
+        self.input_edit.textChanged.connect(self.start_token_count_timer) # Connect textChanged to timer start
 
         self.send_button = QPushButton("Send")
         self.send_button.clicked.connect(self.send_message)
@@ -143,14 +150,31 @@
             print(f"Error saving markdown conversation: {e}")
 
     @pyqtSlot()
+    def start_token_count_timer(self):
+        """Starts the token count timer, debouncing the update."""
+        self.token_count_timer.start()
+
+    @pyqtSlot()
     def update_token_count_display(self):
+        """Updates the token count display based on the full context."""
         text = self.input_edit.toPlainText()
         if text:
             try:
-                token_count = self.client.models.count_tokens(model=self.chat._model, contents=text).total_tokens
+                contents_to_count = []
+                contents_to_count.append(self.chat._chat_session.config.system_instruction) # Add system prompt
+                contents_to_count.extend(self.chat._chat_session.history) # Add chat history
+                contents_to_count.append({"role": "user", "parts": [text]}) # Add current input text as user message
+
+                # Count tokens for the combined content
+                token_count_response = self.client.models.count_tokens(
+                    model=self.chat._model,
+                    contents=contents_to_count
+                )
+                token_count = token_count_response.total_tokens
                 self.token_count_label.setText(f"Tokens: {token_count}")
             except Exception as e:
                 print(f"Error counting tokens: {e}")
+                print(f"Content being tokenized: {contents_to_count}") # Debugging output
                 self.token_count_label.setText("Tokens: Error") # Indicate error
         else:
             self.token_count_label.setText("Tokens: 0") # Reset to 0 if input is empty

```

**Explanation of Changes in `ui.py`:**

1.  **Debouncing Implementation with `QTimer`:**
    *   **`self.token_count_timer = QTimer()`**:  A `QTimer` instance is created in `MainWindow.__init__` to handle debouncing.
    *   **`self.token_count_timer.setInterval(300)`**:  The timer is set to a 300 millisecond interval. This means the `timeout` signal will be emitted 300ms after the timer is started (and not restarted). You can adjust this value (e.g., 200ms, 500ms) to fine-tune the responsiveness.
    *   **`self.token_count_timer.setSingleShot(True)`**: The timer is set to `singleShot`, meaning it will only emit `timeout` once after being started and then stop.
    *   **`self.token_count_timer.timeout.connect(self.update_token_count_display)`**: The `timeout` signal of the timer is connected to the `update_token_count_display` slot function. This function will be called when the timer times out.
    *   **`self.input_edit.textChanged.connect(self.start_token_count_timer)`**:  The `textChanged` signal of `self.input_edit` is now connected to a new slot `self.start_token_count_timer`.
    *   **`@pyqtSlot() def start_token_count_timer(self):`**: This new slot function simply starts the `self.token_count_timer`.  Each time the text changes, this timer is started or restarted. If typing continues, the timer keeps getting restarted before it can time out. Only when typing pauses for longer than 300ms will the timer time out and trigger `update_token_count_display`.

2.  **Modified `update_token_count_display` for Full Context Counting:**
    *   **`contents_to_count = []`**:  An empty list `contents_to_count` is created to hold all parts of the context.
    *   **`contents_to_count.append(self.chat._chat_session.config.system_instruction)`**: The system prompt is retrieved from `self.chat._chat_session.config.system_instruction` and added to the list.
    *   **`contents_to_count.extend(self.chat._chat_session.history)`**: The entire conversation history (list of messages) is extended to the `contents_to_count` list.
    *   **`contents_to_count.append({"role": "user", "parts": [text]})`**: The current text from the input field is structured as a user message (role: "user", parts: list containing the text) and appended to the list. This represents the user's *next* message in the context.
    *   **`token_count_response = self.client.models.count_tokens(...)`**:  The `self.client.models.count_tokens` method is called with `contents=contents_to_count`. This counts the tokens for the *entire* context: system prompt, history, and current input.
    *   **`token_count = token_count_response.total_tokens`**:  The `total_tokens` from the response is extracted.
    *   **Debugging Output**:  If token counting fails (in the `except` block), a debugging `print(f"Content being tokenized: {contents_to_count}")` is added to help diagnose issues by showing exactly what content was attempted to be tokenized.

**Benefits of these Changes:**

*   **Accurate Token Count:** The token count now reflects the *actual* token usage for each query, including the system prompt and the entire conversation history, providing a much more realistic view of context window consumption.
*   **Improved UI Performance:** Debouncing the token count updates significantly reduces the frequency of token counting calculations, leading to a much smoother and more responsive text input experience, especially for longer input texts.
*   **User Awareness:** Developers will have better insights into how their conversation history and input length affect token usage, enabling them to manage context more effectively.

**Implementation Steps:**

1.  **Apply the `ui.py` diff:**  Modify your `ask_src/ui.py` file by applying the provided code diff.
2.  **Run `ask.py`:** Start InsightCoder.
3.  **Type in the Input Field:** Type text into the input field and observe the "Tokens: [count]" label. The token count should now update after a short delay (300ms after you stop typing) and reflect the full context token usage.  The typing experience should be much smoother.
4.  **Test with Long Conversations:** Have longer conversations to verify that the token count correctly accumulates the history and reflects the growing context size.
5.  **Check for Errors (Console):**  Keep an eye on the console for any "Error counting tokens" messages. If you encounter errors, the debugging output `print(f"Content being tokenized: {contents_to_count}")` in `update_token_count_display` will be helpful in understanding what content caused the issue.

After these steps, InsightCoder's token counter should be accurate and performant, providing a significantly improved user experience. Let me know if you have any further questions or issues!

