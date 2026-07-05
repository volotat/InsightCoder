import type { ProjectContext } from "./contextEngine";

/**
 * Single home of every prompt template (ported from the Python app's
 * chat_utils.py, where the persona/params were duplicated in three places).
 */

function renderCodebase(ctx: ProjectContext): string {
  return ctx.files
    .map(
      (f) =>
        `file: ${f.relPath}\n---- file start ----\n${f.content}\n---- file end ----\n`
    )
    .join("\n");
}

export function buildSystemPrompt(ctx: ProjectContext): string {
  const fullContext = `CODEBASE CONTEXT (whole codebase of the project):
${renderCodebase(ctx)}

GIT DIFF CONTEXT (current uncommitted changes):
\`\`\`diff
${ctx.gitDiff}
\`\`\`

CONVERSATION HISTORY CONTEXT (summaries of past conversations):
${ctx.summaries}
`;

  return `
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

${fullContext}`;
}

export function buildSummaryPrompt(fullConversationText: string): string {
  return `Summarize the following conversation about a codebase. Focus on the main questions asked by the user and the key insights, answers, or code modifications suggested by the AI. Keep the summary concise and informative, ideally a few sentences or a short bulleted list of key topics.

Conversation:
\`\`\`
${fullConversationText}
\`\`\`

Concise Summary:
`;
}

export const SUMMARY_GENERATION = { temperature: 0.5, maxOutputTokens: 8192 };
