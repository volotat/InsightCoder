import unittest
from ask_src.diff_detector import detect_diff_blocks

class TestDiffDetector(unittest.TestCase):

    def test_detect_single_diff_block(self):
        text_content = """
This is some text.
```diff
--- a/file.py
+++ b/file.py
@@ -1,4 +1,5 @@
 @@
 def hello():
     print("hello")
+    print("world")
 ```
 And some more text after.
 """
        diff_blocks = detect_diff_blocks(text_content)
        self.assertEqual(len(diff_blocks), 1, "Should detect one diff block")
        self.assertIn("+++ b/file.py", diff_blocks[0]['diff_block_content'], "Should contain diff content") # Access 'diff_block_content'

    def test_detect_multiple_diff_blocks(self):
        text_content = """
Here is diff block 1:
```diff
--- a/file1.py
+++ b/file1.py
@@ -1,1 +1,1 @@
-old line
+new line
 ```
 And here is diff block 2:
 ```diff
--- a/file2.py
+++ b/file2.py
@@ -1,1 +1,1 @@
-old code
+new code
 ```
 """
        diff_blocks = detect_diff_blocks(text_content)
        self.assertEqual(len(diff_blocks), 2, "Should detect two diff blocks")
        self.assertIn("+++ b/file1.py", diff_blocks[0]['diff_block_content'], "Block 1 should contain diff 1 content") # Access 'diff_block_content'
        self.assertIn("+++ b/file2.py", diff_blocks[1]['diff_block_content'], "Block 2 should contain diff 2 content") # Access 'diff_block_content'

    def test_no_diff_blocks(self):
        text_content = """
This text contains no diff blocks.
Here is a regular code block:
```python
def hello():
    print("hello")
```
"""
        diff_blocks = detect_diff_blocks(text_content)
        self.assertEqual(len(diff_blocks), 0, "Should detect zero diff blocks")

    def test_diff_block_with_description(self):
        diff_content_with_desc = """```diff
--- a/file.py
+++ b/file.py
@@ -1,4 +1,5 @@
 @@
 def hello():
     print("hello")
+    print("world")
 ```
 This is a code change.
 """
        diff_blocks = detect_diff_blocks(diff_content_with_desc)
        self.assertEqual(len(diff_blocks), 1, "Should detect diff block even with surrounding text")
        self.assertIn("+++ b/file.py", diff_blocks[0]['diff_block_content'], "Should contain diff content with description") # Access 'diff_block_content'

    def test_code_block_with_diff_word_but_not_diff(self): # New test case - still relevant
        not_diff_content = """```text
This is not a diff, but it contains the word diff in text format.
```"""
        diff_blocks = detect_diff_blocks(not_diff_content)
        self.assertEqual(len(diff_blocks), 0, "Should not detect code block with 'diff' word as diff if no diff syntax")

    def test_extract_file_path_single_block(self):
        text_content = """
```diff
--- a/ask_src/chat_utils.py
+++ b/ask_src/chat_utils.py
@@ -1,1 +1,1 @@
-old line
+new line
 ```
 """
        diff_blocks = detect_diff_blocks(text_content)
        self.assertEqual(len(diff_blocks), 1, "Should detect one diff block")
        self.assertEqual(diff_blocks[0]['file_path'], "ask_src/chat_utils.py", "Should extract file path")

    def test_extract_file_path_multiple_blocks(self):
        text_content = """
```diff
--- a/file1.py
+++ b/file1.py
@@ -1,1 +1,1 @@
-old line
+new line
 ```

 ```diff
--- a/folder/file2.js
+++ b/folder/file2.js
@@ -1,1 +1,1 @@
-old code
+new code
 ```
 """
        diff_blocks = detect_diff_blocks(text_content)
        self.assertEqual(len(diff_blocks), 2, "Should detect two diff blocks")
        self.assertEqual(diff_blocks[0]['file_path'], "file1.py", "Block 1 should extract file path")
        self.assertEqual(diff_blocks[1]['file_path'], "folder/file2.js", "Block 2 should extract file path")

    def test_extract_file_path_no_filepath(self):
        text_content = """
```diff
--- a/
+++ b/
@@ -1,1 +1,1 @@
-old line
+new line
 ```
 """
        diff_blocks = detect_diff_blocks(text_content)
        self.assertEqual(len(diff_blocks), 1, "Should detect one diff block")
        self.assertIsNone(diff_blocks[0]['file_path'], "Should return None if file path not found")


if __name__ == '__main__':
    unittest.main()