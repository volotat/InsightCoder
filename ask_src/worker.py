import threading
import markdown
from PyQt5.QtCore import pyqtSignal, QObject

class ChatSignals(QObject):
    update_text = pyqtSignal(str, bool, str)

class ChatWorker(threading.Thread):
    def __init__(self, message, current_history, callback_signal, chat):
        super().__init__(daemon=True)
        self.message = message
        self.current_history = current_history  # already includes user's message
        self.callback_signal = callback_signal
        self.chat = chat

    def run(self):
        history = self.current_history
        reply_text = ""
        try:
            response = self.chat.send_message_stream(self.message)
            for chunk in response:
                reply_text += chunk.text
                updated_md = history + f"\n\n**Model:**\n\n{reply_text}\n\n"
                updated_html = markdown.markdown(updated_md, extensions=["fenced_code", "codehilite", "nl2br"])
                self.callback_signal.emit(updated_html, False, "")
            final_md = history + f"\n\n**Model:**\n\n{reply_text}\n\n"
            final_html = markdown.markdown(final_md, extensions=["fenced_code", "codehilite", "nl2br"])
            self.callback_signal.emit(final_html, True, final_md)
        except Exception as e:
            error_msg = history + f"\n\n**Error:**\n\n{str(e)}\n\n"
            html = markdown.markdown(error_msg, extensions=["fenced_code", "codehilite", "nl2br"])
            self.callback_signal.emit(html, True, error_msg)