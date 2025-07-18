# ask.py

import sys
import os
from PyQt5.QtWidgets import QApplication
# Import configure_api, start_chat_session, load_conversation, reconstruct_markdown_history
from ask_src.chat_utils import configure_api, start_chat_session, load_conversation, reconstruct_markdown_history
from ask_src.ui import MainWindow
from ask_src.worker import ChatSignals, SummaryWorker # Import SummaryWorker
import argparse
import glob
import re
import time # Import time for optional feedback

def main():
    parser = argparse.ArgumentParser(description="InsightCoder: AI-powered codebase analysis.")
    parser.add_argument(
        "--project-path",
        "-p",
        type=str,
        default=".",
        help="Path to the project directory you want to analyze."
    )
    parser.add_argument(
        "--conversation-path",
        "-c",
        type=str,
        default=None, # Default to None, handled in ask.py and chat_utils
        help="Path to the directory where conversation history will be saved."
    )
    args = parser.parse_args()
    project_path = args.project_path

    if args.conversation_path is not None:
        conversation_path = args.conversation_path
    else:
        # Default conversation path relative to project_path
        conversation_path = os.path.join(project_path, "project_info", "conversations")

    # Ensure the conversation directory exists before proceeding
    os.makedirs(conversation_path, exist_ok=True)

    # --- START: Configure Client and Startup Summarization Logic ---
    client = configure_api() # Configure API client once

    print(f"Checking for unsummarized conversations in: {conversation_path}")
    # Find all conversation files (conversation_N.md)
    all_conv_files = glob.glob(os.path.join(conversation_path, "conversation_*.md"))
    # Find all summary files (conversation_N_summary.md)
    all_summary_files = glob.glob(os.path.join(conversation_path, "conversation_*_summary.md"))

    # Extract the conversation numbers from both lists
    conv_numbers = set()
    for filepath in all_conv_files:
        basename = os.path.basename(filepath)
        match = re.search(r'conversation_(\d+)\.md', basename)
        if match:
            conv_numbers.add(int(match.group(1)))

    summary_numbers = set()
    for filepath in all_summary_files:
        basename = os.path.basename(filepath)
        match = re.search(r'conversation_(\d+)_summary\.md', basename)
        if match:
            summary_numbers.add(int(match.group(1)))

    # Find numbers that are in conv_numbers but not in summary_numbers
    unsummarized_numbers = sorted(list(conv_numbers - summary_numbers))

    summary_workers = []
    chat_signals_for_startup = ChatSignals() # Use ChatSignals for startup summarization feedback (optional)

    if unsummarized_numbers:
        print(f"Found {len(unsummarized_numbers)} unsummarized conversation(s): {unsummarized_numbers}")
        print("Starting summarization process sequentially with 5-second delays. Please wait...")
        
        for i, number in enumerate(unsummarized_numbers):
            print(f"Processing conversation {number} ({i+1}/{len(unsummarized_numbers)})...")
            conv_filepath = os.path.join(conversation_path, f"conversation_{number}.md")
            summary_filepath = os.path.join(conversation_path, f"conversation_{number}_summary.md")

            # Load the full conversation content (list of dicts)
            conversation_list = load_conversation(conv_filepath)
            # Reconstruct markdown history for summarization
            full_markdown_history = reconstruct_markdown_history(conversation_list)

            if full_markdown_history.strip(): # Check if reconstruction resulted in non-empty content
                # Create the SummaryWorker
                worker = SummaryWorker(client, full_markdown_history, summary_filepath, chat_signals_for_startup)
                worker.start() # Start the worker
                worker.join()  # Wait for this worker to complete before starting the next one
                print(f"Completed summarizing conversation {number}")
                
                # Add a 5-second delay between workers
                if i < len(unsummarized_numbers) - 1:  # If this isn't the last conversation
                    print(f"Waiting 5 seconds before processing next conversation...")
                    time.sleep(5)  # Wait 5 seconds
            else:
                print(f"Warning: conversation_{number}.md is empty or could not be loaded correctly. Skipping summarization.")

        print("All unsummarized conversations processed.")
    else:
        print("No unsummarized conversations found.")
    # --- END: Configure Client and Startup Summarization Logic ---


    # Now proceed with the main application startup
    # The client is already configured
    client, chat = start_chat_session(client, project_path, conversation_path) # Pass client, project_path, and conversation_path

    app = QApplication(sys.argv)
    chat_signals = ChatSignals() # Initialize ChatSignals for UI communication
    win = MainWindow(client, chat, chat_signals, project_path, conversation_path) # Pass client, chat_signals, project_path, and conversation_path
    win.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()