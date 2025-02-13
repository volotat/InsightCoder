import sys
from PyQt5.QtWidgets import QApplication
from ask_src.chat_utils import start_chat_session
from ask_src.ui import MainWindow
from ask_src.worker import ChatSignals
import argparse  # Import the argparse module

def main():
    parser = argparse.ArgumentParser(description="InsightCoder: AI-powered codebase analysis.")
    parser.add_argument(
        "--project-path",
        "-p",
        type=str,
        default=".",  # Default to current directory if no path is provided
        help="Path to the project directory you want to analyze."
    )
    args = parser.parse_args()
    project_path = args.project_path

    app = QApplication(sys.argv)
    chat = start_chat_session(project_path) # Pass project_path to start_chat_session
    chat_signals = ChatSignals()
    win = MainWindow(chat, chat_signals, project_path)
    win.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()