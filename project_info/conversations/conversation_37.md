

**User:**

For some reason the code is not properly highlighted, it just separated into the grey box. And sometimes it get's splitted into non-code section for no obvious reason. What is the most robust way to fix this issue? Probably with internal js processing instead of prepareting it with `markdown.markdown` method.



**Model:**

Of course. You've pinpointed the exact issue. Relying on the Python `markdown` library's `codehilite` extension (which uses `Pygments`) to generate static HTML for highlighting can be brittle, especially when rendering in a web view. It can lead to the issues you described, like incorrect highlighting or formatting conflicts.

The most robust solution is to delegate the syntax highlighting to a dedicated JavaScript library running directly within the `QWebEngineView`. This approach separates the markdown-to-HTML conversion from the syntax highlighting, leading to much more reliable and attractive results.

We will use **`highlight.js`**, a popular and powerful client-side syntax highlighter. Here is the step-by-step plan to implement this change:

1.  **Add `highlight.js` assets** to the project.
2.  **Remove `Pygments`** as a dependency, since it will no longer be used.
3.  **Delete the old CSS** file for `Pygments`.
4.  **Refactor the UI and Worker** to stop generating highlighting in Python and instead load the `highlight.js` library and its CSS into the `QWebEngineView`.

---

### Phase 1: Adding Assets and Updating Dependencies

First, we need to add the `highlight.js` library and a CSS theme to our project.

1.  Create a new directory: `InsightCoder/ask_src/assets/`
2.  Download the core library from [this link](https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js) and save it as `InsightCoder/ask_src/assets/highlight.min.js`.
3.  Download a CSS theme. Let's use "Atom One Dark" for a modern look. Download it from [this link](https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css) and save it as `InsightCoder/ask_src/assets/atom-one-dark.min.css`.

Next, let's clean up our project dependencies and old files.

#### 1. Update `requirements.txt`
Since `Pygments` will no longer be used for highlighting, we can remove it.

```diff
--- a/InsightCoder/requirements.txt
+++ b/InsightCoder/requirements.txt
@@ -1,4 +1,3 @@
 PyQt5
 google-generativeai
 markdown
-Pygments

```

#### 2. Delete Obsolete CSS File
The old CSS file for Pygments is now redundant. Please delete the following file:
`InsightCoder/ask_src/pygments_default.css`

---

### Phase 2: Refactoring the Code

Now, let's modify the application to use the new client-side highlighting mechanism.

#### 1. Modify `ask_src/ui.py`
This is the core of the change. We will update `MainWindow` to load the `highlight.js` assets and adjust its styling. We'll also tell the `markdown` converter to stop trying to highlight code.

```python:InsightCoder/ask_src/ui.py
 import os
 import re
 import glob, time
 import markdown
-from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt, QTimer
+from PyQt5.QtCore import pyqtSignal, pyqtSlot, Qt, QTimer, QUrl
 from PyQt5.QtWidgets import QMainWindow, QPushButton, QVBoxLayout, QHBoxLayout, QWidget, QTextEdit, QLabel
 from PyQt5.QtWebEngineWidgets import QWebEngineView
 
@@ -81,30 +81,28 @@
         self.web_view = QWebEngineView()
         self.web_view.page().profile().setHttpAcceptLanguage("en-us")
 
-        # Load Pygments CSS and base styles once
-        self.html_style = ""
-        pygments_css_path = os.path.join(os.path.dirname(__file__), "pygments_default.css")
-        try:
-            with open(pygments_css_path, "r", encoding="utf-8") as css_file:
-                self.html_style = f"""
-                    body {{ 
-                        font-family: monospace; 
-                        font-size: 12pt; 
-                        background-color: #fdfdfd; 
-                    }}
-                    {css_file.read()}
-                """
-        except Exception as e:
-            print("Error loading pygments CSS:", e)
-            self.html_style = "body { font-family: monospace; font-size: 12pt; }"
+        # Define the base path for local assets like CSS and JS for the web view
+        self.assets_path = os.path.join(os.path.dirname(__file__), "assets")
+
+        # Define the base HTML styles. Syntax highlighting styles will be loaded from a file.
+        self.html_style = """
+            body { 
+                font-family: monospace; 
+                font-size: 12pt; 
+                background-color: #282c34; /* Match atom-one-dark background */
+                color: #abb2bf;           /* Match atom-one-dark foreground */
+            }
+            a { color: #61afef; } /* A nice blue for links */
+            pre {
+                white-space: pre-wrap; /* Allow wrapping for long lines */
+                word-wrap: break-word; /* Break long words */
+            }
+        """
 
         # Set initial content (the welcome page)
         initial_html_body = markdown.markdown(
             self.chat_history,
-            extensions=["fenced_code", "codehilite", "nl2br"],
-            extension_configs={'codehilite': {'guess_lang': False}}
+            extensions=["fenced_code", "nl2br"]
         )
         self.update_chat_display(initial_html_body, False, "")
 
@@ -176,19 +174,28 @@
 
     @pyqtSlot(str, bool, str)
     def update_chat_display(self, html_body, final, final_md):
-        full_html = f"""
+        # The base URL is crucial for loading local CSS and JS files in QWebEngineView
+        base_url = QUrl.fromLocalFile(self.assets_path + os.path.sep)
+
+        full_html = f"""
         <html>
         <head>
+            <meta charset="UTF-8">
+            <link rel="stylesheet" href="atom-one-dark.min.css">
             <style>{self.html_style}</style>
+            <script src="highlight.min.js"></script>
         </head>
         <body>
             {html_body}
+            <script>
+                // This script runs after the body is loaded.
+                // It finds all <pre><code> blocks and applies highlighting.
+                hljs.highlightAll();
+            </script>
         </body>
         </html>
         """
-        self.web_view.setHtml(full_html)
-        # Use a timeout to ensure the scroll happens after the DOM update
+        self.web_view.setHtml(full_html, baseUrl=base_url)
         if self.conversation_started: # Only auto-scroll if conversation is active
              self.web_view.page().runJavaScript("setTimeout(function() {{ window.scrollTo(0, document.body.scrollHeight); }}, 100);")
 
@@ -288,9 +295,7 @@
         self.chat_history += f"\n\n**User:**\n\n{user_msg}\n\n"
         html_body = markdown.markdown(
             self.chat_history,
-            extensions=["fenced_code", "codehilite", "nl2br"],
-            extension_configs={'codehilite': {'guess_lang': False}}
+            extensions=["fenced_code", "nl2br"]
         )
         self.update_chat_display(html_body, False, "")
 
```

#### 2. Modify `ask_src/worker.py`
We need to make the same change to the `markdown` calls inside the `ChatWorker` to prevent it from generating `Pygments` HTML.

```python:InsightCoder/ask_src/worker.py
...
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
-                    extensions=["fenced_code", "codehilite", "nl2br"],
-                    extension_configs={'codehilite': {'guess_lang': False}}
+                    extensions=["fenced_code", "nl2br"]
                 )
                 self.callback_signal.emit(updated_html, False, "")
             final_md = history + f"\n\n**Model:**\n\n{reply_text}\n\n"
             final_html = markdown.markdown(
                 final_md,
-                extensions=["fenced_code", "codehilite", "nl2br"],
-                extension_configs={'codehilite': {'guess_lang': False}}
+                extensions=["fenced_code", "nl2br"]
             )
 
             diff_blocks = detect_diff_blocks(final_md) # Call detect_diff_blocks to get a list of dictionaries
...
```

### Summary of Changes

With these modifications, the application will no longer handle syntax highlighting in Python. Instead, it will:
- Convert the markdown to basic HTML, creating standard `<pre><code class="language-python">...</code></pre>` blocks for fenced code.
- Load this HTML into the `QWebEngineView`.
- The `QWebEngineView` will then load the `highlight.js` library and its "Atom One Dark" theme from your local `assets` folder.
- Finally, a script will run inside the web view, find all code blocks, and apply beautiful, robust highlighting.

This will fix the rendering issues and give your application a much more professional and reliable code display. Please let me know if you have any questions.

