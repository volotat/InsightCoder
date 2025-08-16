The user reported three issues with the application: inability to select text, small font size, and a UI freeze when sending messages.

The AI proposed the following solutions:
*   **Text Selection:** Wrap chat messages within `ft.SelectionArea` widgets.
*   **Font Size:** Apply a global `ft.Theme` to the page, setting a dark mode and increasing the `body_medium`, `body_large`, and `title_medium` font sizes.
*   **UI Freeze:** Introduce a small `asyncio.sleep(0.01)` after displaying the user's message but before initiating the network request, allowing the UI to update immediately.

The suggested code modifications were consolidated into the `ask.py` file, implementing these changes.