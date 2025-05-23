import threading
import markdown
from PyQt5.QtCore import pyqtSignal, QObject
from ask_src.diff_detector import detect_diff_blocks # Import detect_diff_blocks
import os
import traceback
import json

class ChatSignals(QObject):
    update_text = pyqtSignal(str, bool, str)

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
                updated_html = markdown.markdown(updated_md, extensions=["fenced_code", "codehilite", "nl2br"])
                self.callback_signal.emit(updated_html, False, "")
            final_md = history + f"\n\n**Model:**\n\n{reply_text}\n\n"
            final_html = markdown.markdown(final_md, extensions=["fenced_code", "codehilite", "nl2br"])

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