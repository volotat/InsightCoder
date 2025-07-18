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