import sys
from PyQt5.QtWidgets import QApplication
from ask_src.chat_utils import start_chat_session
from ask_src.ui import MainWindow
from ask_src.worker import ChatSignals

def main():
    app = QApplication(sys.argv)
    chat = start_chat_session()
    chat_signals = ChatSignals()
    win = MainWindow(chat, chat_signals)
    win.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()