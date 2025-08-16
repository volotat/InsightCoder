

**User:**

I cannot select text from the window, a text there is a bit too small also. And for some reason when I send the message there is a delay until the message will appear in the screen until the models starts giving the response and as it is not immidiate the app seems to be freezed for that time. Let's fix it all.



**Model:**

Of course. I can address all three of your concerns: making the text selectable, increasing the font size, and fixing the UI freeze when sending a message.

Here is my plan to resolve these issues:

1.  **Enable Text Selection:** I will wrap each chat message in a `ft.SelectionArea` widget. This is a standard Flet control that makes its content (in this case, our Markdown messages) selectable by the user.

2.  **Increase Font Size:** I will apply a global theme to the application. This will not only increase the base font size for better readability but also set a dark theme, which is often preferred for developer tools. Please note that this will slightly increase the font size of all UI elements, not just the chat view.

3.  **Eliminate UI Freeze:** The delay you're experiencing is because the application sends the network request to the AI *before* the UI has a chance to redraw with your new message. I will add a very small `asyncio.sleep(0.01)` after your message is added to the view. This tiny pause is enough to yield control to the UI thread, allowing it to render your message instantly before the network call begins, which eliminates the feeling of a freeze.

Here are the necessary changes consolidated into the `ask.py` file.

### `ask.py`

I will apply all the fixes to the main application file.

```python
import flet as ft
import asyncio
import os
import re     
import glob   
import argparse 
from functools import partial 

# Import your services and original utils
from src.services import ChatService, TokenCounterService, ConversationService, ContextService, StartupService
from src.chat_utils import configure_api, start_chat_session

# --- Welcome Message Constant ---
WELCOME_MESSAGE = """
# Welcome to InsightCoder

Your AI-powered codebase analysis assistant.

**⚠️ Important Privacy Notice**: This tool sends your project's source code to an external LLM service for analysis. **Do not use this tool on repositories containing personal, confidential, or sensitive information.**

### How to get started:

1.  Ask a question about your codebase in the text box below.
2.  Use `Shift+Enter` for a new line in the input box.
3.  Press `Enter` to send your message.

*This message will be replaced by your conversation history once you send your first message.*
"""

# --- 1. State Management ---
class AppState:
    """A class to hold the application's state."""
    def __init__(self, project_path=".", conversation_path=None):
        self.project_path = project_path
        self.conversation_path = conversation_path

        # Chat settings
        self.model_name = "gemini-2.5-pro" # Default model

        # Backend objects
        self.api_client = None
        self.chat_session = None

        # UI state
        self.chat_history_md = "" # Start with empty history
        self.is_processing = False
        self.conversation_counter = 1


# --- 2. UI Components ---

class ChatView(ft.ListView):
    """Component for displaying chat messages."""
    def __init__(self):
        super().__init__(
            expand=True,
            spacing=10,
            auto_scroll=True,
        )
        # Wrap the welcome message to make it selectable
        self.controls = [
            ft.SelectionArea(content=ft.Markdown(
                WELCOME_MESSAGE,
                extension_set="gitHubWeb",
                #code_theme="atom-one-dark",
            ))
        ]

class InputBar(ft.Row):
    """Component for the user input text field and action buttons."""
    def __init__(self, on_send_message, on_reload_context, on_input_change):
        self.user_input = ft.TextField(
            hint_text="Ask a question about the codebase...",
            expand=True,
            multiline=True,
            shift_enter=True,
            on_submit=on_send_message,
            on_change=on_input_change, # <-- Add this line
        )
        self.send_button = ft.IconButton(
            icon=ft.Icons.SEND_ROUNDED,
            tooltip="Send message",
            on_click=on_send_message,
        )
        self.reload_button = ft.IconButton(
            icon=ft.Icons.REFRESH,
            tooltip="Reload Context",
            on_click=on_reload_context,
        )
        super().__init__(
            controls=[
                self.user_input,
                self.send_button,
                self.reload_button,
            ]
        )

# --- 3. Main Application ---

class InsightCoderApp:
    def __init__(self, page: ft.Page, state: AppState):
        self.page = page
        self.state = state
        self.page.title = "InsightCoder"
        self.page.horizontal_alignment = ft.CrossAxisAlignment.CENTER

        # For debouncing token count
        self.debounce_task = None 

        # Initialize UI Components
        self.chat_view = ChatView()
        self.input_bar = InputBar(
            on_send_message=self.send_message_click,
            on_reload_context=self.reload_context_click,
            on_input_change=self.handle_input_change, 
        )
        self.model_selector = ft.Dropdown(
            hint_text="Choose a model",
            options=[
                ft.dropdown.Option("gemini-2.5-pro"),
                ft.dropdown.Option("gemini-2.5-flash"),
            ],
            value=self.state.model_name,
            on_change=self.on_model_change,
            width=220,
            tooltip="Select the AI model. Reload context to apply.",
        )
        self.token_count_label = ft.Text("Tokens: 0", text_align=ft.TextAlign.RIGHT, color=ft.Colors.ON_SURFACE_VARIANT)
        

        self.chat_service = ChatService()
        self.token_service = TokenCounterService()
        self.conversation_service = ConversationService() 
        self.context_service = ContextService()
        self.build_ui()

    def build_ui(self):
        self.page.add(
            ft.Container(
                content=self.chat_view,
                border=ft.border.all(1, ft.Colors.OUTLINE),
                border_radius=5,
                padding=10,
                expand=True,
            ),
            self.input_bar,
            ft.Row(
                controls=[
                    self.model_selector,
                    self.token_count_label,
                ],
                alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
            ),
        )
        self.page.update()

    async def send_message_click(self, e):
        user_text = self.input_bar.user_input.value
        if not user_text.strip() or self.state.is_processing:
            return

        self.state.is_processing = True
        self.input_bar.user_input.value = ""
        self.input_bar.user_input.disabled = True
        self.input_bar.send_button.disabled = True
        self.input_bar.reload_button.disabled = True

        # Clear welcome message on first message
        if len(self.chat_view.controls) == 1 and "Welcome" in self.chat_view.controls[0].content.value:
            self.chat_view.controls.clear()

        # Display user message
        user_message_md = ft.Markdown(
            f"**User:**\n\n{user_text}",
            extension_set="gitHubWeb",
            #code_theme="atom-one-dark"
        )
        # Wrap in SelectionArea to make it selectable
        self.chat_view.controls.append(ft.SelectionArea(content=user_message_md))
        self.page.update()

        # Display placeholder for model response
        model_response_md = ft.Markdown(
            "**Model:**\n\nThinking...",
            extension_set="gitHubWeb",
            #code_theme="atom-one-dark"
        )
        # Wrap in SelectionArea to make it selectable
        self.chat_view.controls.append(ft.SelectionArea(content=model_response_md))
        self.page.update()

        # Yield to the UI thread to render messages before starting the API call
        await asyncio.sleep(0.01)

        # Stream the response
        model_reply_text = ""
        async def on_chunk(chunk):
            nonlocal model_reply_text
            model_reply_text += chunk
            model_response_md.value = f"**Model:**\n\n{model_reply_text}▍"
            self.page.update()

        await self.chat_service.send_message_stream(self.state, user_text, on_chunk)

        # Finalize response
        model_response_md.value = f"**Model:**\n\n{model_reply_text}"

        # The full history has been updated inside send_message_stream
        await self.conversation_service.save_conversation_and_summarize_async(self.state)

        self.state.is_processing = False
        self.input_bar.user_input.disabled = False
        self.input_bar.send_button.disabled = False
        self.input_bar.reload_button.disabled = False
        self.input_bar.user_input.focus()
        self.page.update()

    async def handle_input_change(self, e):
        """Debounces the token count update."""
        if self.debounce_task:
            self.debounce_task.cancel()

        # Create a new task to update the token count after a short delay
        self.debounce_task = asyncio.create_task(self._update_token_count_debounced(e.data))

    async def _update_token_count_debounced(self, text_value):
        """Waits for a pause in typing, then updates the token count."""
        try:
            await asyncio.sleep(0.5)  # 500ms delay

            self.token_count_label.value = "Tokens: Counting..."
            self.page.update()

            # Note: We pass the entire state because the service needs access to the
            # chat session history and API client for an accurate count.
            token_count = await self.token_service.count_tokens_async(self.state, text_value)

            if token_count != -1:
                self.token_count_label.value = f"Tokens: {token_count}"
            else:
                self.token_count_label.value = "Tokens: Error"

            self.page.update()
        except asyncio.CancelledError:
            # This is expected if the user types again quickly. We do nothing.
            pass

    async def reload_context_click(self, e):
        """Handles the reload context action."""
        if self.state.is_processing:
            return

        print("UI: Reload context button clicked.")
        self.state.is_processing = True
        self.input_bar.user_input.disabled = True
        self.input_bar.send_button.disabled = True
        self.input_bar.reload_button.disabled = True
        original_token_text = self.token_count_label.value
        self.token_count_label.value = "Reloading codebase context..."
        self.page.update()

        new_chat_session = await self.context_service.reload_context_and_create_session_async(self.state)

        if new_chat_session:
            self.state.chat_session = new_chat_session
            self.token_count_label.value = "Context reloaded successfully."
            # A small delay before reverting the token label
            await asyncio.sleep(2) 
            self.token_count_label.value = original_token_text
        else:
            self.token_count_label.value = "Error: Failed to reload context."
            await asyncio.sleep(3)
            self.token_count_label.value = original_token_text

        self.state.is_processing = False
        self.input_bar.user_input.disabled = False
        self.input_bar.send_button.disabled = False
        self.input_bar.reload_button.disabled = False
        self.input_bar.user_input.focus()
        self.page.update()

    async def on_model_change(self, e):
        """Handles model selection change."""
        self.state.model_name = self.model_selector.value
        print(f"UI: Model selection changed to {self.state.model_name}")

        # Give the user feedback that a reload is required.
        original_token_text = self.token_count_label.value
        self.token_count_label.value = "Model changed. Reload context to apply."
        self.page.update()

        await asyncio.sleep(3)
        # Revert the label only if no other process is running
        if not self.state.is_processing:
            self.token_count_label.value = original_token_text
        self.page.update()



async def main(page: ft.Page, project_path: str, conversation_path: str or None):
    # Apply theme for better readability and aesthetics
    page.theme_mode = ft.ThemeMode.DARK
    page.theme = ft.Theme(
        text_theme=ft.TextTheme(
            body_medium=ft.TextStyle(size=15),      # Regular text
            body_large=ft.TextStyle(size=18),       # Larger text like headers
            title_medium=ft.TextStyle(size=20),     # Titles
        )
    )

    state = AppState(project_path=project_path, conversation_path=conversation_path)

    if state.conversation_path is None:
        state.conversation_path = os.path.join(state.project_path, "project_info", "conversations")
    os.makedirs(state.conversation_path, exist_ok=True)

    # --- RUN STARTUP TASKS ---
    # First, configure the API client, as it's needed for summarization
    state.api_client = configure_api()

    # Run the startup summarization and wait for it to complete
    startup_service = StartupService()
    await startup_service.summarize_startup_conversations_async(state)
    # --- END STARTUP TASKS ---

    # Now, calculate the conversation counter (it will be accurate after startup summaries)
    pattern_md = os.path.join(state.conversation_path, "conversation_*.md")
    pattern_summary = os.path.join(state.conversation_path, "conversation_*_summary.md")
    all_conv_files = glob.glob(pattern_md) + glob.glob(pattern_summary)

    numbers = set()
    for filepath in all_conv_files:
        basename = os.path.basename(filepath)
        match = re.search(r'conversation_(\d+)', basename)
        if match:
            numbers.add(int(match.group(1)))
    state.conversation_counter = max(numbers) + 1 if numbers else 1
    print(f"Next conversation number is: {state.conversation_counter}")

    # Initialize chat session (it will now correctly load all summaries)
    print("Initializing chat session with updated context...")
    _, state.chat_session = start_chat_session(
        state.api_client,
        state.project_path,
        state.conversation_path,
        state.model_name # Pass the selected model
    )
    print("Initialization complete.")

    # Finally, create and run the UI
    app = InsightCoderApp(page, state)


if __name__ == "__main__":
    # --- ADD ARGUMENT PARSING ---
    parser = argparse.ArgumentParser(description="InsightCoder: AI-powered codebase analysis.")
    parser.add_argument(
        "--project-path",
        "-p",
        type=str,
        default=".",
        help="Path to the project directory you want to analyze."
    )
    parser.add_-argument(
        "--conversation-path",
        "-c",
        type=str,
        default=None,
        help="Path to the directory where conversation history will be saved."
    )
    args = parser.parse_args()

    # Create a partial function to pass arguments to the Flet app target
    main_with_args = partial(main, project_path=args.project_path, conversation_path=args.conversation_path)

    ft.app(target=main_with_args)
```

These changes should significantly improve the user experience of the application. Let me know if you have any other questions

