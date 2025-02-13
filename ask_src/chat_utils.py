import os
import sys
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

def get_codebase(input_dir): # Accept input_dir as argument
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
        dirs[:] = [d for d in dirs if not d.startswith('.')]
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
            combined_content.append(f"file: InsightCoder/{rel_path}")
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

def create_system_prompt(project_path): # Accept project_path as argument
    input_dir = os.path.abspath(project_path) # Use project_path here
    codebase = get_codebase(input_dir) # Use input_dir here
    git_diff = get_git_diff(input_dir) # Use input_dir here
    full_code = f"""CODEBASE CONTEXT (whole codebase of the project):
{codebase}

GIT DIFF CONTEXT (current uncommitted changes):
```diff
{git_diff}
```"""

    system_prompt = f"""
You are an AI assistant designed to analyze and answer questions about a given codebase.
All the info about you as a project will be presented in a form of a current codebase.

If you need to analyze the code, carefully review the provided code files and provide detailed, professional responses.
Consider best practices, potential issues, and optimization opportunities.
Format your answers with clear headings and code blocks using Markdown code fences when needed.
Use specific language syntax highlighting within code fences where applicable (e.g., python\\n...\\n, javascript\\n...\\n).
Answer user questions based on the provided codebase context.

{full_code}"""
    return system_prompt

def start_chat_session(project_path): # Accept project_path as argument
    client = configure_api()
    system_prompt = create_system_prompt(project_path) # Pass project_path to create_system_prompt

    # Load a saved conversation from a file:
    #history = load_conversation("conversations/conversation_2.md")

    chat = client.chats.create(
        model="gemini-2.0-flash-thinking-exp-01-21",
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.8,
            top_p=0.95,
            top_k=40,
            max_output_tokens=8192 * 2,
            response_mime_type="text/plain"),
        history = [])

    return chat

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