import unittest
import tempfile
import os
import shutil
import glob

from PyQt5.QtWidgets import QApplication
from ask import main  # Or import MainWindow and chat initialization directly if preferred
from ask_src.ui import MainWindow
from ask_src.chat_utils import start_chat_session
from ask_src.worker import ChatSignals


class ConversationFolderTests(unittest.TestCase):

    def setUp(self):
        self.app = QApplication([])  # Initialize QApplication for PyQt tests
        self.temp_project_dir = tempfile.TemporaryDirectory()
        self.project_path = self.temp_project_dir.name
        self.default_conversation_path = os.path.join(self.project_path, "project_info", "conversations")
        os.makedirs(self.default_conversation_path, exist_ok=True)  # Ensure conversations dir exists

        # Create .gitignore ignoring conversation folder (for the first test)
        with open(os.path.join(self.project_path, ".gitignore"), "w") as f:
            f.write("project_info/conversations\n")

        self.client, self.chat = start_chat_session(self.project_path, self.default_conversation_path) # Initialize chat session with default conversation path
        self.chat_signals = ChatSignals() # Initialize ChatSignals
        self.main_window = MainWindow(self.client, self.chat, self.chat_signals, self.project_path, self.default_conversation_path) # Initialize MainWindow with default path


    def tearDown(self):
        self.app.exit() # Clean up QApplication
        if os.path.exists(self.project_path): # For extra robustness in cleanup
            shutil.rmtree(self.temp_project_dir.name) # Use temp_project_dir for cleanup

    def test_gitignore_conversation_folder(self):
        # 1. Simulate saving a conversation
        test_conversation_text = "**User:** Hello\n\n**Model:** Hi there!"
        self.main_window.chat_history = test_conversation_text # Directly set chat history for test
        self.main_window.conversation_counter = 1 # Set counter for filename
        self.main_window.save_conversation_md() # Call save function directly

        conversation_file_path = os.path.join(self.default_conversation_path, "conversation_1.md")
        self.assertTrue(os.path.exists(conversation_file_path), "Conversation file should be saved even if gitignored")

        # 2. Simulate restarting and loading conversations
        # Create a new MainWindow instance to simulate restart & loading
        new_main_window = MainWindow(self.client, self.chat, self.chat_signals, self.project_path, self.default_conversation_path)
        loaded_conversation_files = glob.glob(os.path.join(new_main_window.conversation_dir, "conversation_*.md"))

        self.assertGreater(len(loaded_conversation_files), 0, "Conversation file should be loaded even if gitignored")

        # Optionally verify content (if needed for more thorough test)
        with open(loaded_conversation_files[0], 'r', encoding='utf-8') as f:
            loaded_content = f.read()
        self.assertEqual(loaded_content.strip(), test_conversation_text.strip(), "Loaded conversation content should match saved content")

    def test_custom_conversation_folder_outside_project(self):
        # 1. Create a temporary directory for the custom conversation folder (outside project)
        with tempfile.TemporaryDirectory() as custom_conversations_temp_dir:
            custom_conversation_path = custom_conversations_temp_dir

            # Initialize MainWindow with the custom conversation path
            main_window_custom_path = MainWindow(self.client, self.chat, self.chat_signals, self.project_path, custom_conversation_path)

            # Simulate saving a conversation using the custom path
            test_conversation_text = "**User:** Hello from custom path!\n\n**Model:** Greetings from outside project!"
            main_window_custom_path.chat_history = test_conversation_text
            main_window_custom_path.conversation_counter = 1
            main_window_custom_path.save_conversation_md()

            conversation_file_path_custom = os.path.join(custom_conversation_path, "conversation_1.md")
            self.assertTrue(os.path.exists(conversation_file_path_custom), "Conversation file should be saved in custom path")

            # 2. Simulate restarting and loading conversations from custom path
            new_main_window_custom_path = MainWindow(self.client, self.chat, self.chat_signals, self.project_path, custom_conversation_path)
            loaded_conversation_files_custom = glob.glob(os.path.join(new_main_window_custom_path.conversation_dir, "conversation_*.md"))

            self.assertGreater(len(loaded_conversation_files_custom), 0, "Conversation file should be loaded from custom path")

            # Optionally verify content for custom path
            with open(loaded_conversation_files_custom[0], 'r', encoding='utf-8') as f:
                loaded_content_custom = f.read()
            self.assertEqual(loaded_content_custom.strip(), test_conversation_text.strip(), "Loaded conversation content from custom path should match saved content")


if __name__ == '__main__':
    unittest.main()