import sys
import os
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
    parser.add_argument(
        "--conversation-path",
        "-c",
        type=str,
        default=None,  # Default conversation path
        help="Path to the directory where conversation history will be saved."
    )
    args = parser.parse_args()
    project_path = args.project_path
    
    if args.conversation_path is not None:
        conversation_path = args.conversation_path
    else:
        conversation_path = os.path.join(project_path, "project_info", "conversations") # Directory to save conversations by default
    
    os.makedirs(conversation_path, exist_ok=True) # Create directory if it doesn't exist


    app = QApplication(sys.argv)
    client, chat = start_chat_session(project_path, conversation_path) # Pass project_path to start_chat_session
    chat_signals = ChatSignals()
    win = MainWindow(client, chat, chat_signals, project_path, conversation_path)
    win.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()