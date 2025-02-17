def detect_diff_blocks(text_content):
    """
    Detects and extracts code diff blocks from a text content, including file paths.

    Args:
        text_content (str): The text content to search for diff blocks.

    Returns:
        list: A list of dictionaries, where each dictionary represents a diff block
              and contains:
                'diff_block_content' (str): The content of the diff block.
                'file_path' (str or None): The extracted file path from the diff header,
                                           or None if not found or invalid.
              Returns an empty list if no diff blocks are found.
    """
    diff_blocks = []
    md_lines = text_content.splitlines()
    in_code_block = False
    code_block = []
    current_diff_block = None # To store diff block content and file path temporarily

    for line in md_lines:
        if line.strip().startswith("```diff"):  # Detect '```diff' opening fence
            in_code_block = True
            code_block = [] # Start a new code block
            current_diff_block = {'diff_block_content': [], 'file_path': None} # Initialize for new block
        elif line.strip().startswith("```") and in_code_block: # Closing fence
            in_code_block = False
            if current_diff_block is not None: # Check if current_diff_block is initialized
                current_diff_block['diff_block_content'] = "\n".join(code_block)
                diff_blocks.append(current_diff_block) # Add extracted block info to list
                current_diff_block = None # Reset for next diff block
            code_block = [] # Reset code block
        elif in_code_block:
            code_block.append(line) # Append lines inside code block
            if len(code_block) == 1 and code_block[0].strip().startswith("--- a/"):
                file_path_line = code_block[0].strip()
                parts = file_path_line.split("--- a/")
                if len(parts) > 1:
                    extracted = parts[1].strip()
                    current_diff_block['file_path'] = extracted if extracted else None

    return diff_blocks