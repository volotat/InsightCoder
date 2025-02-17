import os
import sys
import glob
import subprocess
from google import genai
from google.genai import types

def configure_api():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY not set in environment.")
        sys.exit(1)
    client = genai.Client(api_key=api_key)
    return client

def get_codebase(input_dir, conversation_dir): # Accept input_dir as argument
    print(f"Collecting codebase content from: {input_dir}...") # Informative message
    text_extensions = {
        '.py', '.js', '.java', '.c', '.cpp', '.h', '.hpp',
        '.html', '.css', '.scss', '.less', '.yaml', '.yml',
        '.txt', '.md', '.json', '.xml', '.csv', '.ini',
        '.cfg', '.conf', '.sh', '.bat', '.ps1', '.go',
        '.rs', '.php', '.rb', '.lua', '.sql', '.toml'
    }
    excluded_extensions = {'.min.js', '.min.css', '.map', '.csv',
                             '.io.js', '.io.css', '.esm.js', '.esm.css', '.cjs.js', '.cjs.css'}
    excluded_files = {'static/js/chart.js', 'static/photoswipe/photoswipe.css'}
    excluded_dirs = {conversation_dir} # Exclude conversation directory

    project_name = os.path.basename(input_dir) # Get project name

    def is_ignored(rel_path):
        try:
            result = subprocess.run(
                ['git', 'check-ignore', '--quiet', rel_path],
                cwd=input_dir, # Use input_dir here
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            return result.returncode == 0
        except Exception as e:
            print(f"Error checking Git ignore status for {rel_path}: {e}")
            return False

    files = []
    for root, dirs, filenames in os.walk(input_dir): # Use input_dir here
        print(f"Processing directory: {dirs}")
        dirs[:] = [d for d in dirs if not d.startswith('.')]

        # Exclude directories
        dirs[:] = [d for d in dirs if os.path.join(root, d) not in excluded_dirs]

        for filename in filenames:
            filename_lower = filename.lower()
            if any(filename_lower.endswith(ext) for ext in excluded_extensions):
                continue
            ext = os.path.splitext(filename)[1].lower()
            if ext in text_extensions:
                full_path = os.path.join(root, filename)
                rel_path = os.path.relpath(full_path, input_dir) # Use input_dir here
                if rel_path in excluded_files:
                    continue
                if not is_ignored(rel_path):
                    files.append((rel_path, full_path))

    combined_content = []
    for rel_path, full_path in files:
        try:
            with open(full_path, 'r', encoding='utf-8', errors='replace') as infile:
                content = infile.read()
            combined_content.append(f"file: {os.path.join(project_name,rel_path)}")
            combined_content.append("---- file start ----")
            combined_content.append(content)
            combined_content.append("---- file end ----\n")
        except Exception as e:
            print(f"Error processing {rel_path}: {str(e)}")
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
    except Exception as e:
        print(f"Error getting Git diff: {str(e)}")
        return "Unable to retrieve Git diff information."

def create_system_prompt(project_path, conversation_path): 
    input_dir = os.path.abspath(project_path) 
    conversation_dir = os.path.abspath(conversation_path) 
    codebase = get_codebase(input_dir, conversation_dir) 
    git_diff = get_git_diff(input_dir) 
    conversation_history_context = get_conversation_history_context(conversation_dir)
    
    full_context = f"""CODEBASE CONTEXT (whole codebase of the project):
{codebase}

GIT DIFF CONTEXT (current uncommitted changes):
```diff
{git_diff}
```

CONVERSATION HISTORY CONTEXT (summaries of past conversations):
{conversation_history_context}
"""
    
    
    
    # Save the full_context to a file for debugging
    with open("full_context.txt", "w", encoding="utf-8") as f:
        f.write(full_context)

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

{full_context}"""
    

    return system_prompt


def get_conversation_history_context(conversation_path):
    conversation_files = glob.glob(os.path.join(conversation_path, "conversation_*.md")) # Search for conversation files
    conversation_content = []
    for filepath in conversation_files: # Iterate over files
        try:
            with open(filepath, 'r', encoding='utf-8') as infile: # Read content
                content = infile.read()

            rel_path = os.path.relpath(filepath, conversation_path) # Get relative path 
            conversation_content.append(f"file: {rel_path}")
            conversation_content.append("---- file start ----")
            conversation_content.append(content)
            conversation_content.append("---- file end ----\n")
        except Exception as e:
            print(f"Error reading conversation file: {filepath} - {e}") # Handle errors
    return "\n".join(conversation_content) # Return combined content

def start_chat_session(project_path, conversation_path): # Accept project_path as argument
    client = configure_api()
    system_prompt = create_system_prompt(project_path, conversation_path) # Pass project_path to create_system_prompt

    # Load a saved conversation from a file (example - not used in current implementation):
    # history = load_conversation("conversations/conversation_2.md")
    # history = load_conversation(os.path.join(project_path, "project_info", "conversations", "conversation_2.md"))

    chat = client.chats.create(
        model="gemini-2.0-flash-thinking-exp-01-21",
        #model="gemini-2.0-pro-exp-02-05",
        #model="gemini-2.0-flash-lite-preview-02-05",
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.8,
            top_p=0.95,
            top_k=40,
            max_output_tokens=8192 * 2,
            response_mime_type="text/plain"),
        history = [])

    return client, chat 

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
    """
    conversation = []
    current_role = None
    current_lines = []
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
    return conversation