import asyncio
import traceback
import os 
import re
import glob

from ask_src.chat_utils import configure_api, start_chat_session, summarize_conversation, create_system_prompt
from google import genai
import google.genai.chats as chats

class ChatService:
    @staticmethod
    async def send_message_stream(state, user_message: str, on_chunk):
        """
        Sends a message to the chat session and streams the response.

        Args:
            state (AppState): The current application state.
            user_message (str): The message from the user.
            on_chunk (callable): An async callback function to handle response chunks.
        """
        reply_text = ""
        try:
            response_stream = state.chat_session.send_message_stream(user_message)
            for chunk in response_stream:
                text_chunk = chunk.text if chunk.text is not None else ""
                reply_text += text_chunk
                await on_chunk(text_chunk)
                await asyncio.sleep(0.01) # Yield control to allow UI updates
        except Exception as e:
            print(f"Error in send_message_stream: {e}")
            traceback.print_exc()
            await on_chunk(f"\n\n**Error:**\n\n```\n{str(e)}\n```")

        # After the stream is complete, update the full chat history
        state.chat_history_md += f"\n\n**User:**\n\n{user_message}\n\n"
        state.chat_history_md += f"\n\n**Model:**\n\n{reply_text}\n\n"

class TokenCounterService:
    @staticmethod
    async def count_tokens_async(state, text_to_count: str) -> int:
        """
        Counts the tokens in the full context (system prompt + history + current text).
        This runs the synchronous API call in a separate thread to avoid blocking.
        """
        if not text_to_count:
            return 0

        try:
            # The count_tokens call is synchronous, so we run it in a thread
            # to avoid blocking the async event loop.
            return await asyncio.to_thread(
                TokenCounterService._count_tokens_sync,
                state.api_client,
                state.chat_session,
                text_to_count
            )
        except Exception as e:
            print(f"Error counting tokens: {e}")
            return -1 # Indicate an error

    @staticmethod
    def _count_tokens_sync(client: genai.Client, chat: chats.Chat, text: str) -> int:
        """Synchronous part of the token counting logic."""
        # This logic is adapted from the original TokenCountWorker.
        # It relies on internal attributes of the ChatSession object, which is
        # not ideal but necessary to replicate the original functionality.
        # A future improvement could be to manage history outside the session object.

        # Reconstruct the contents to be counted
        contents_to_count = []
        system_prompt = chat._config.system_instruction
        contents_to_count.append({"role": "system", "parts": [{"text": system_prompt}]})

        history = chat.get_history()  

        if history:
            for message in history:
                contents_to_count.append(message)
        if text:
            contents_to_count.append({"role": "user", "parts": [{"text": text}]})

        token_count_response = client.models.count_tokens(
            model=chat._model, # e.g., 'gemini-2.5-pro'
            contents=contents_to_count
        )
        return token_count_response.total_tokens
    
class ConversationService:
    @staticmethod
    async def _read_file_async(path):
        """Helper to read a file asynchronously."""
        def read_sync():
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    return f.read()
            except FileNotFoundError:
                print(f"File not found: {path}")
                return None
        return await asyncio.to_thread(read_sync)

    @staticmethod
    async def save_conversation_and_summarize_async(state):
        """
        Saves the main conversation file and triggers a background task for summarization.
        """
        try:
            conv_num = state.conversation_counter
            filepath_md = os.path.join(state.conversation_path, f"conversation_{conv_num}.md")
            filepath_summary = os.path.join(state.conversation_path, f"conversation_{conv_num}_summary.md")

            # 1. Save the main conversation file (non-blocking)
            await asyncio.to_thread(
                ConversationService._write_file_sync, filepath_md, state.chat_history_md
            )
            print(f"Markdown conversation saved to: {filepath_md}")

            # 2. Trigger summarization as a background task (fire and forget)
            asyncio.create_task(
                ConversationService._create_summary_background(
                    state.api_client, state.chat_history_md, filepath_summary
                )
            )
        except Exception as e:
            print(f"Error saving conversation: {e}")
            traceback.print_exc()

    @staticmethod
    def _write_file_sync(path, content):
        """Helper function to run synchronous file write in a thread."""
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)

    @staticmethod
    async def _create_summary_background(client, history_md, summary_filepath):
        """Runs the summarization process in the background."""
        print(f"Starting background summarization for {os.path.basename(summary_filepath)}...")
        try:
            # The summarize_conversation function makes a blocking network call,
            # so we run it in a thread to not block the main asyncio event loop.
            summary = await asyncio.to_thread(
                summarize_conversation, client, history_md
            )
            if summary:
                await asyncio.to_thread(
                    ConversationService._write_file_sync, summary_filepath, summary
                )
                print(f"Summarization complete: {os.path.basename(summary_filepath)}")
            else:
                 print(f"Summarization returned empty content for {os.path.basename(summary_filepath)}.")
        except Exception as e:
            print(f"Error during background summarization: {e}")
            traceback.print_exc()

class ContextService:
    @staticmethod
    async def reload_context_and_create_session_async(state):
        """
        Gathers the codebase context and creates a new chat session.
        This is a potentially slow operation, so it runs in a thread.
        """
        print("ContextService: Starting context reload...")
        try:
            # The context creation involves heavy, synchronous file I/O, 
            # so we run it in a thread to avoid blocking the UI.
            new_chat_session = await asyncio.to_thread(
                ContextService._reload_context_sync, state
            )
            print("ContextService: New chat session created successfully.")
            return new_chat_session
        except Exception as e:
            print(f"Error in ContextService: {e}")
            traceback.print_exc()
            return None

    @staticmethod
    def _reload_context_sync(state):
        """The synchronous part of the context reloading logic."""
        # This is adapted from your original ChatUtils and ContextReloadWorker

        # 1. Re-create the system prompt with the latest files and summaries
        system_prompt = create_system_prompt(state.project_path, state.conversation_path)

        # 2. Extract current history from the Markdown string
        # We need to convert the markdown history back into the list of dicts format
        # that the Google API's `history` parameter expects.
        # Let's add a helper for this.
        current_history_list = ContextService._reconstruct_history_list(state.chat_history_md)

        # 3. Create a new chat session with the new system prompt and existing history
        new_chat = state.api_client.chats.create(
            model="gemini-2.5-pro",
            history=current_history_list,
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=1,
                top_p=0.95,
                top_k=64,
                max_output_tokens=65536, # Increased output tokens as per model capability
                response_mime_type="text/plain",
            )
        )
        return new_chat

    @staticmethod
    def _reconstruct_history_list(markdown_history: str):
        """
        Converts the markdown chat history string back into the API's list format.
        A simple parser will do for this.
        """
        history = []
        if not markdown_history.strip():
            return history

        # Split by turns, which are separated by "**User:**" or "**Model:**"
        turns = re.split(r'\n\n(?=\*\*(User|Model):\*\*\n\n)', markdown_history.strip())

        for turn in turns:
            if not turn.strip():
                continue

            if turn.startswith("**User:**"):
                role = "user"
                content = turn.replace("**User:**\n\n", "").strip()
            elif turn.startswith("**Model:**"):
                role = "model"
                content = turn.replace("**Model:**\n\n", "").strip()
            else:
                # This could happen for the first part of a split if history is malformed
                continue

            history.append({"role": role, "parts": [{"text": content}]})

        return history
    
class StartupService:
    @staticmethod
    async def summarize_startup_conversations_async(state):
        """
        Finds and summarizes all unsummarized conversations from previous sessions
        upon application startup.
        """
        print(f"Checking for unsummarized conversations in: {state.conversation_path}")

        # Find all conversation and summary files
        all_conv_files = glob.glob(os.path.join(state.conversation_path, "conversation_*.md"))
        all_summary_files = glob.glob(os.path.join(state.conversation_path, "conversation_*_summary.md"))

        # Extract numbers to find which conversations lack a summary
        conv_numbers = {int(re.search(r'conversation_(\d+)\.md', os.path.basename(f)).group(1)) for f in all_conv_files if re.search(r'conversation_(\d+)\.md', os.path.basename(f))}
        summary_numbers = {int(re.search(r'conversation_(\d+)_summary\.md', os.path.basename(f)).group(1)) for f in all_summary_files if re.search(r'conversation_(\d+)_summary\.md', os.path.basename(f))}

        unsummarized_numbers = sorted(list(conv_numbers - summary_numbers))

        if not unsummarized_numbers:
            print("No unsummarized conversations found.")
            return

        print(f"Found {len(unsummarized_numbers)} unsummarized conversation(s): {unsummarized_numbers}")
        print("Starting summarization process sequentially with 5-second delays...")

        for i, number in enumerate(unsummarized_numbers):
            print(f"Processing conversation {number} ({i+1}/{len(unsummarized_numbers)})...")
            conv_filepath = os.path.join(state.conversation_path, f"conversation_{number}.md")
            summary_filepath = os.path.join(state.conversation_path, f"conversation_{number}_summary.md")

            # Read the old conversation's content
            full_markdown_history = await ConversationService._read_file_async(conv_filepath)

            if full_markdown_history and full_markdown_history.strip():
                # Run the summarization and wait for it to complete
                await ConversationService._create_summary_background(
                    state.api_client, full_markdown_history, summary_filepath
                )

                # Replicate the 5-second delay to avoid rate-limiting
                if i < len(unsummarized_numbers) - 1:
                    print("Waiting 5 seconds before next summary...")
                    await asyncio.sleep(5)
            else:
                print(f"Skipping empty conversation file: {conv_filepath}")

        print("All startup summarization tasks complete.")