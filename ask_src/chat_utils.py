# ask_src/chat_utils.py

import os
import sys
import glob
import subprocess
from google import genai
from google.genai import types
import traceback

def configure_api():
    """Configures the Google Generative AI client."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set in environment.")
        sys.exit(1)
    try:
        client = genai.Client(api_key=api_key)
        # Basic check to see if client can access models (optional but good)
        list(client.models.list())
        print("Google Generative AI client configured successfully.")
        return client
    except Exception as e:
        print(f"Error configuring Google Generative AI client: {e}")
        traceback.print_exc()
        sys.exit(1)


def get_codebase(input_dir, conversation_dir): # Accept input_dir and conversation_dir as arguments
    print(f"Collecting codebase content from: {input_dir}...") # Informative message
    text_extensions = {
        '.py', '.js', '.java', '.c', '.cpp', '.h', '.hpp',
        '.html', '.css', '.scss', '.less', '.yaml', '.yml',
        '.txt', '.md', '.json', '.xml', '.csv', '.ini',
        '.cfg', '.conf', '.sh', '.bat', '.ps1', '.go',
        '.rs', '.php', '.rb', '.lua', '.sql', '.toml', 
        '.mdx'
    }
    excluded_extensions = {'.min.js', '.min.css', '.map', '.csv',
                             '.io.js', '.io.css', '.esm.js', '.esm.css', '.cjs.js', '.cjs.css'}
    excluded_files = {'static/js/chart.js', 'static/photoswipe/photoswipe.css'}

    # Get the absolute path of the conversation directory for reliable exclusion
    # Ensure conversation_dir is treated as absolute for comparison
    abs_conversation_dir = os.path.abspath(conversation_dir)

    # Define common excluded directories
    excluded_dirs = {'.git', '__pycache__', '.venv', 'venv', 'node_modules'} # Added common venv/node_modules etc.

    def is_ignored(rel_path, git_dir):
        """Checks if a relative path is ignored by Git."""
        try:
            # Use --no-index to check against .gitignore without needing the file to be in the index
            result = subprocess.run(
                ['git', '--git-dir', os.path.join(git_dir, '.git'), '--work-tree', git_dir, 'check-ignore', '--quiet', rel_path],
                cwd=git_dir, # Use git_dir here
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            return result.returncode == 0
        except FileNotFoundError:
             # Git command not found, ignore check
             # print("Warning: Git command not found. Cannot check .gitignore.")
             return False # Assume not ignored if git command not found
        except Exception as e:
            print(f"Error checking Git ignore status for {rel_path}: {e}")
            traceback.print_exc()
            return False

    files = []
    # Find the .git directory to correctly use check-ignore
    git_dir = None
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--show-toplevel'],
            cwd=input_dir,
            capture_output=True,
            text=True,
            check=True # Raise exception if git command fails (e.g., not a git repo)
        )
        git_dir = result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        print(f"Warning: Not a Git repository or git command not found at {input_dir}. .gitignore will not be checked.")
        pass # Not a git repository, proceed without gitignore check

    for root, dirs, filenames in os.walk(input_dir):
        # Create a copy of dirs for modification during iteration
        dirs_copy = dirs[:]

        # Modify dirs_copy in place to prevent walking into hidden or excluded directories
        dirs[:] = [] # Clear original dirs list
        for d in dirs_copy:
            if d.startswith('.') and d != '.': # Allow walking into the current directory '.' if needed, but exclude other dot dirs
                continue
            # Check if the directory is a known excluded directory name
            if d in excluded_dirs:
                continue
            # Check if the absolute path of this directory starts with the absolute conversation directory path
            abs_current_dir = os.path.abspath(os.path.join(root, d))
            if abs_current_dir.startswith(abs_conversation_dir):
                 # If we are in the conversation directory itself or a subdirectory, skip it
                 print(f"Excluding conversation directory from codebase walk: {abs_current_dir}")
                 continue # Skip this directory

            dirs.append(d) # If not excluded, add back to dirs for os.walk to traverse


        # Filter files based on extension, excluded files list, and gitignore
        for filename in filenames:
            filename_lower = filename.lower()
            if any(filename_lower.endswith(ext) for ext in excluded_extensions):
                continue
            ext = os.path.splitext(filename)[1].lower()
            if ext in text_extensions:
                full_path = os.path.join(root, filename)
                rel_path = os.path.relpath(full_path, input_dir)

                # Explicitly exclude files within the conversation directory
                if os.path.abspath(full_path).startswith(abs_conversation_dir):
                     # print(f"Explicitly excluding file from codebase walk (in conv dir): {rel_path}")
                     continue # Skip files within the conversation directory

                if rel_path in excluded_files:
                    continue

                # If it's a git repository, check .gitignore
                if git_dir:
                    if is_ignored(rel_path, git_dir):
                        # print(f"Ignoring gitignored file: {rel_path}")
                        continue # Skip gitignored files

                # If it passed all checks, add to files list
                files.append((rel_path, full_path))

    combined_content = []
    project_name = os.path.basename(os.path.abspath(input_dir)) # Get project name for context labeling
    if project_name == "": project_name = "Current Project" # Handle root directory case
    for rel_path, full_path in files:
        try:
            with open(full_path, 'r', encoding='utf-8', errors='replace') as infile:
                content = infile.read()
            # Use project_name for clarity in the prompt, e.g., "file: MyProject/src/main.py"
            combined_content.append(f"file: {os.path.join(project_name,rel_path)}")
            combined_content.append("---- file start ----")
            combined_content.append(content)
            combined_content.append("---- file end ----\n")
        except Exception as e:
            print(f"Error processing {rel_path}: {str(e)}")
            traceback.print_exc()
    print(f"Finished collecting codebase content. Found {len(files)} files.")
    return "\n".join(combined_content)


def get_git_diff(input_dir): # Accept input_dir as argument
    try:
        staged = subprocess.run(
            ['git', 'diff', '--staged'],
            cwd=input_dir, # Use input_dir here
            capture_output=True,
            text=True
        )
        unstaged = subprocess.run(
            ['git', 'diff'],
            cwd=input_dir, # Use input_dir here
            capture_output=True,
            text=True
        )
        diff_output = ""
        if staged.stdout:
            diff_output += "STAGED CHANGES:\n" + staged.stdout + "\n"
        if unstaged.stdout:
            diff_output += "UNSTAGED CHANGES:\n" + unstaged.stdout + "\n"
        return diff_output.strip() or "No uncommitted changes detected."
    except FileNotFoundError:
         print("Warning: Git command not found. Cannot get Git diff.")
         return "Unable to retrieve Git diff information (git command not found)."
    except Exception as e:
        print(f"Error getting Git diff: {str(e)}")
        traceback.print_exc()
        return "Unable to retrieve Git diff information."


# Add summarize_conversation function
def summarize_conversation(client, full_conversation_text):
    """
    Uses the LLM to generate a concise summary of a conversation.

    Args:
        client: The Google Generative AI client instance.
        full_conversation_text (str): The full text of the conversation.

    Returns:
        str: The generated summary text.
        None: If summarization fails.
    """
    if not full_conversation_text.strip():
        return "" # Return empty string for empty conversation

    try:
        # Craft the summarization prompt
        summary_prompt = f"""Summarize the following conversation about a codebase. Focus on the main questions asked by the user and the key insights, answers, or code modifications suggested by the AI. Keep the summary concise and informative, ideally a few sentences or a short bulleted list of key topics.

Conversation:
```
{full_conversation_text}
```

Concise Summary:
"""
        # Use the main model for consistency and to leverage its context understanding
        # Consider adjusting the model name if you have a dedicated summarization model preference
        response = client.models.generate_content(
             contents=summary_prompt,
             #model="gemini-2.5-flash-preview-04-17", # Use the main model for summarization
             model="gemini-2.5-flash", # Use the main model for summarization
             #model="gemini-2.5-pro",
             config=types.GenerateContentConfig(
                temperature=0.5,
                top_p=0.95,
                top_k=64,
                max_output_tokens=65536, # Increased output tokens as per model capability
                response_mime_type="text/plain",
                #thinking_config=types.ThinkingConfig(
                #    thinking_budget=8192 # Example value based on API docs
                #)
            ),
        )
        
        # Check if response has text content and return stripped text
        return response.text.strip() if response.text else ""
    except Exception as e:
        print(f"Error during conversation summarization: {e}")
        traceback.print_exc() # Print traceback for debugging
        return None # Indicate failure


# Modify get_conversation_history_context to load summaries
def get_conversation_history_context(project_path, conversation_path): # Accept project_path and conversation_path
    # Use provided conversation_path if available, otherwise default to project_info/conversations
    # The conversation_dir is already determined and passed from ask.py
    conversation_dir = conversation_path

    # Ensure the directory exists before trying to list files
    if not os.path.exists(conversation_dir):
        print(f"Conversation directory not found: {conversation_dir}. No history loaded.")
        return "" # Return empty string if conversation directory doesn't exist

    # Look for summary files
    conversation_files = glob.glob(os.path.join(conversation_dir, "conversation_*_summary.md"))
    # Sort files by name to maintain chronological order
    conversation_files.sort()

    conversation_content = []
    print(f"Loading conversation summaries from: {conversation_dir}")
    for filepath in conversation_files: # Iterate over summary files
        try:
            with open(filepath, 'r', encoding='utf-8') as infile: # Read content
                content = infile.read()

            # Include the summary filename for context
            # Use relative path to the conversation directory itself for clarity in prompt
            rel_path = os.path.relpath(filepath, conversation_dir)
            conversation_content.append(f"Conversation Summary file: {rel_path}")
            conversation_content.append("---- file start ----")
            conversation_content.append(content)
            conversation_content.append("---- file end ----\n")
        except Exception as e:
            print(f"Error reading conversation summary file: {filepath} - {e}") # Handle errors
            traceback.print_exc() # Print traceback for debugging
    print(f"Finished loading conversation summaries. Found {len(conversation_files)} summary files.")
    return "\n".join(conversation_content) # Return combined content


def create_system_prompt(project_path, conversation_path): # Accept project_path and conversation_path
    input_dir = os.path.abspath(project_path) # Use project_path here
    # Pass conversation_path to get_codebase to exclude conversation files
    codebase = get_codebase(input_dir, conversation_path)
    git_diff = get_git_diff(input_dir) # Use input_dir here

    full_code = f"""CODEBASE CONTEXT (whole codebase of the project):
{codebase}

GIT DIFF CONTEXT (current uncommitted changes):
```diff
{git_diff}
```"""

    # Get conversation history context from summaries
    conversation_history_context = get_conversation_history_context(project_path, conversation_path)

    full_context = f"""{full_code}

CONVERSATION HISTORY CONTEXT (summaries of past conversations):
{conversation_history_context}
"""

    # Save the full_context to a file for debugging
    try:
        with open("full_context.txt", "w", encoding="utf-8", errors='replace') as f:
            f.write(full_context)
    except Exception as e:
        print(f"Error saving full_context.txt: {e}")
        traceback.print_exc()


    system_prompt = f"""
You are an AI assistant designed to analyze and answer questions about a given codebase.
All the info about you as a project will be presented in a form of a current codebase.

If you need to analyze the code, carefully review the provided code files and provide detailed, professional responses.
Consider best practices, potential issues, and optimization opportunities.
Format your answers with clear headings and code blocks using Markdown code fences when needed.
Use specific language syntax highlighting within code fences where applicable (e.g., python\\n...\\n, javascript\\n...\\n).
Answer user questions based on the provided codebase context and conversation history.
If you have any confusion or need more information, ask the user questions for clarification before presenting the changes.
If you cannot guarantee a specific behavior that is required by a given task in the code you suggest, make sure to note that in your response.
If you are not sure about something, make sure to point it out and highlight the weak points in your response if there are any.
Do not try to implement everything at once. Split complex tasks into multiple phases and implement them step by step, providing test cases for each phase and asking for user's confirmation before proceeding to the next step.
Prioritize concise and simple solutions when possible and sufficient.
Try to show the minimal changes in code needed, expect if it is absolutely necessary to clarify the changes with more information.
Try to preserve original comments and docstrings in the existing code as it could be valuable information for the developer.
If the past of the code have not been change preserve its original formatting and comments, don't try to minimize it unless asked specifically.
Don't waste time by shilling the user. Go straight to the point. The user needs your expertise, not your approval.

{full_context}"""
    # If you change any file, please print the whole content of the file, so it could be easily replaced as whole with the proposed changes. If files became too large consider splitting them into smaller parts as a refactoring routine. Do not print any files with partial changes. It is highly important to not suppress any lines even if they are not changed, as the file is usually copy-pasted as a whole and may lead to the loss of important parts of the code.


    return system_prompt


def start_chat_session(client, project_path, conversation_path): # Accept client
    system_prompt = create_system_prompt(project_path, conversation_path) # Pass project_path and conversation_path

    # Load a saved conversation from a file (example - not used in current implementation):
    # history = load_conversation(os.path.join(conversation_path, "conversation_2.md")) # Example of loading specific conversation

    chat = client.chats.create(
        #model="gemini-2.5-pro-preview-05-06",
        #model="gemini-2.5-pro-exp-03-25",
        #model="gemini-2.5-flash-preview-04-17", # Using the specified flash model
        #model="gemini-2.5-flash-preview-05-20",
        #model="gemini-2.5-flash",
        model="gemini-2.5-pro",
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=1,
            top_p=0.95,
            top_k=64,
            max_output_tokens=65536, # Increased output tokens as per model capability
            response_mime_type="text/plain",
            #thinking_config=types.ThinkingConfig(
            #    thinking_budget=8192
            #)
        ),
        history = []) # Start with empty history, as context is in system prompt

    # Return both client and chat (though client is already passed in now)
    return client, chat # Keeping return signature consistent


def load_conversation(filepath):
    """
    Loads a saved conversation from a markdown file.
    Expected format:
    **User:**

    user message...

    **Model:**

    model message...

    Returns:
    List of dicts in the form:
    [
        {"role": "user", "parts": ["user message..."]},
        {"role": "model", "parts": ["model message..."]},
    ]
    Returns empty list if file not found or error occurs.
    """
    conversation = []
    current_role = None
    current_lines = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.rstrip()
                if line.startswith("**User:**"):
                    if current_role is not None and current_lines:
                        conversation.append({
                            "role": current_role.lower(),
                            "parts": ["\n".join(current_lines).strip()]
                        })
                    current_role = "User"
                    current_lines = []
                elif line.startswith("**Model:**"):
                    if current_role is not None and current_lines:
                        conversation.append({
                            "role": current_role.lower(),
                            "parts": ["\n".join(current_lines).strip()]
                        })
                    current_role = "Model"
                    current_lines = []
                else:
                    # Append non-empty lines to current message
                    if line:
                        current_lines.append(line)
            # Append last collected message if any
            if current_role is not None and current_lines:
                conversation.append({
                    "role": current_role.lower(),
                    "parts": ["\n".join(current_lines).strip()]
                })
    except FileNotFoundError:
        print(f"Error: Conversation file not found at {filepath}")
        return []
    except Exception as e:
        print(f"Error loading conversation file {filepath}: {e}")
        traceback.print_exc()
        return []

    return conversation

# Helper function to reconstruct markdown from loaded conversation list of dicts
def reconstruct_markdown_history(conversation_list):
    """
    Reconstructs a single markdown string from a list of conversation turns.

    Args:
        conversation_list (list): List of dicts from load_conversation.

    Returns:
        str: Markdown formatted conversation history.
    """
    markdown_text = ""
    for turn in conversation_list:
        role = turn.get('role', '').capitalize()
        parts = turn.get('parts', [])
        content = parts[0] if parts else ""
        if role and content:
            markdown_text += f"\n\n**{role}:**\n\n{content}\n\n"
    return markdown_text.strip() # Remove leading/trailing whitespace

