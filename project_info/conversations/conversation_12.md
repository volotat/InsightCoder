

**User:**

After the last changes the token counting is working. But it is only work when the messages already send and the response is processed. I would also like to add a way to see the total token count when the user is printing his message. Do you have any ideas of how to integrate it?



**Model:**

Okay, implementing real-time token counting as the user types is a great enhancement to provide immediate feedback on context window usage! Here's how we can integrate it into InsightCoder:

**Modified File: `ask_src/ui.py`**

```diff
--- a/ask_src/ui.py
+++ b/ask_src/ui.py
@@ -1,6 +1,6 @@
 import os
 import re
-import glob
+import glob, time
 import markdown
 from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt
 from PyQt5.QtWidgets import QMainWindow, QTextBrowser, QPushButton, QVBoxLayout, QHBoxLayout, QWidget, QTextEdit, QLabel

@@ -44,10 +44,15 @@
         self.input_edit.setStyleSheet("QTextEdit { font-family: monospace; font-size: 12pt; }")
         self.input_edit.textChanged.connect(self.adjust_input_height)
         self.input_edit.enterPressed.connect(self.send_message)
+        self.input_edit.textChanged.connect(self.update_token_count_display) # Connect textChanged signal

         self.send_button = QPushButton("Send")
         self.send_button.clicked.connect(self.send_message)

+        self.token_count_label = QLabel("Tokens: 0") # Label to display token count
+        self.token_count_label.setAlignment(Qt.AlignRight)
+        self.token_count_label.setStyleSheet("QLabel { font-size: 10pt; color: gray; font-family: monospace; }")
+
         input_layout = QHBoxLayout()
         input_layout.addWidget(self.input_edit)
         input_layout.addWidget(self.send_button)
@@ -55,6 +60,7 @@

         layout = QVBoxLayout()
         layout.addWidget(self.text_browser)
+        layout.addWidget(self.token_count_label) # Add token count label to layout
         layout.addLayout(input_layout)

         container = QWidget()
@@ -103,6 +109,18 @@
         except Exception as e:
             print(f"Error saving markdown conversation: {e}")

+    @pyqtSlot()
+    def update_token_count_display(self):
+        text = self.input_edit.toPlainText()
+        if text:
+            try:
+                token_count = self.client.models.count_tokens(model=self.chat._model, contents=text).total_tokens
+                self.token_count_label.setText(f"Tokens: {token_count}")
+            except Exception as e:
+                print(f"Error counting tokens: {e}")
+                self.token_count_label.setText("Tokens: Error") # Indicate error
+        else:
+            self.token_count_label.setText("Tokens: 0") # Reset to 0 if input is empty
+
     def adjust_input_height(self):
         doc_height = self.input_edit.document().size().height()
         new_height = min(100, doc_height + 10)

```

**Explanation of Changes in `ui.py`:**

1.  **`self.token_count_label = QLabel("Tokens: 0")`**:
    *   In `MainWindow.__init__`, we create a new `QLabel` widget called `self.token_count_label`.
    *   It's initialized with the text "Tokens: 0".
    *   `self.token_count_label.setAlignment(Qt.AlignRight)`:  Sets the text alignment to the right, so the token count will be right-aligned in the label's space.
    *   `self.token_count_label.setStyleSheet(...)`: Applies some basic styling to make the label text smaller, gray, and monospace font to visually distinguish it.

2.  **`layout.addWidget(self.token_count_label)`**:
    *   We add `self.token_count_label` as a new widget to the main vertical layout (`layout`), placing it *above* the input layout (`input_layout`) but *below* the `text_browser`. This positions the token count display just above the input area. You can adjust the layout order if you prefer a different position.

3.  **`self.input_edit.textChanged.connect(self.update_token_count_display)`**:
    *   We connect the `textChanged` signal of `self.input_edit` (the `EnterTextEdit` widget) to a new slot function `self.update_token_count_display`. This means that whenever the text in the input field changes (user types, deletes, pastes), the `update_token_count_display` function will be called.

4.  **`@pyqtSlot()` `def update_token_count_display(self):`**:
    *   This is the new slot function that is triggered by the `textChanged` signal.
    *   **`text = self.input_edit.toPlainText()`**:  Gets the current text content from the `input_edit`.
    *   **`if text:`**: Checks if the text is not empty. If it's empty, we just reset the token count to 0 (handled in the `else` block).
    *   **`try...except` block**: We wrap the token counting code in a `try...except` block to handle potential errors during token counting (e.g., API issues, model errors).
    *   **`token_count = self.client.models.count_tokens(model=self.chat._model, contents=text).total_tokens`**: This is the core line:
        *   `self.client.models.count_tokens(...)`: Calls the `count_tokens` method of the Gemini API client.
        *   `model=self.chat._model`: Specifies the model to use for token counting (using the model associated with the current chat session).
        *   `contents=text`:  Passes the current text from the input field as the content to be tokenized.
        *   `.total_tokens`:  Extracts the `total_tokens` count from the result.
        *   `self.token_count_label.setText(f"Tokens: {token_count}")`:  Updates the text of the `self.token_count_label` to display the calculated token count.
    *   **`except Exception as e:`**: If any error occurs during token counting:
        *   `print(f"Error counting tokens: {e}")`: Prints an error message to the console for debugging.
        *   `self.token_count_label.setText("Tokens: Error")`:  Updates the label to display "Tokens: Error" to indicate to the user that token counting failed.
    *   **`else: self.token_count_label.setText("Tokens: 0")`**: If the input text is empty, reset the token count label to "Tokens: 0".

**Implementation Steps:**

1.  **Apply the `ui.py` diff:**  Modify your `ask_src/ui.py` file by applying the provided code diff.
2.  **Run `ask.py`:** Start InsightCoder.
3.  **Type in the Input Field:** As you type in the input `QTextEdit` field, observe the "Tokens: [count]" label that appears above the input area. The token count should update dynamically as you type.
4.  **Test with Different Text:** Try typing various types of text, including code, long sentences, short sentences, etc., and verify that the token count updates reasonably accurately.
5.  **Check for Errors:** Keep an eye on the console output. If there are any errors during token counting, they will be printed to the console.  The UI label will also display "Tokens: Error" if token counting fails.

After these steps, you should have real-time token counting integrated into the InsightCoder UI, providing users with immediate feedback on their input size! Let me know if you encounter any issues or have further questions.

