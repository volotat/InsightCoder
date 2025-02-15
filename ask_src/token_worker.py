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
            if self.text:
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