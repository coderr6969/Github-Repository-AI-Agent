import { StateGraph, START, END } from '@langchain/langgraph';
import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { StructuredTool } from '@langchain/core/tools';
import { AgentStateAnnotation, AgentStateType } from './state.js';
import { AGENT_SYSTEM_PROMPT } from './prompts.js';
import { createLLM } from './llm.factory.js';
import { createSearchCodeTool } from './tools/search-code.tool.js';
import { createGetFileTool } from './tools/get-file.tool.js';
import { createGetPullRequestTool } from './tools/get-pr.tool.js';
import { createAnalyzeDependenciesTool } from './tools/dependency.tool.js';
import { createGenerateTestsTool } from './tools/generate-tests.tool.js';
import { createCreateIssueTool } from './tools/create-issue.tool.js';
import { FileReference, RetrievedChunk, ToolResult } from '../../types/index.js';
import { logger } from '../../config/logger.js';
import { metrics, startTimer } from '../../utils/observability.js';

export interface CompiledAgentGraph {
  invoke(input: { repositoryId: string; question: string; messages?: BaseMessage[] }): Promise<{
    answer: string;
    references: FileReference[];
    toolsUsed: string[];
    messages: BaseMessage[];
  }>;
}

export function buildAgentGraph(repositoryId: string): CompiledAgentGraph {
  const tools: StructuredTool[] = [
    createSearchCodeTool(repositoryId),
    createGetFileTool(repositoryId),
    createGetPullRequestTool(repositoryId),
    createAnalyzeDependenciesTool(repositoryId),
    createGenerateTestsTool(repositoryId),
    createCreateIssueTool(repositoryId),
  ];

  const toolsByName = new Map<string, StructuredTool>();
  for (const t of tools) {
    toolsByName.set(t.name, t);
  }

  const rawLLM = createLLM();
  const llmWithTools = rawLLM.bindTools ? rawLLM.bindTools(tools) : rawLLM;

  // Node 1: Agent Reasoning Node
  const agentNode = async (state: AgentStateType) => {
    metrics.incrementLlmCalls();
    const systemPrompt = new SystemMessage(AGENT_SYSTEM_PROMPT);

    const history = state.messages.length > 0 ? state.messages : [new HumanMessage(state.question)];
    const messagesToSend = [systemPrompt, ...history];

    const response = await llmWithTools.invoke(messagesToSend);
    return {
      messages: [response],
    };
  };

  // Node 2: Tool Execution Node
  const toolNode = async (state: AgentStateType) => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const toolCalls = lastMessage.tool_calls || [];

    const toolMessages: BaseMessage[] = [];
    const toolResults: ToolResult[] = [];
    const toolsUsed: string[] = [];
    const retrievedChunks: RetrievedChunk[] = [];

    for (const call of toolCalls) {
      const toolInstance = toolsByName.get(call.name);
      toolsUsed.push(call.name);

      if (!toolInstance) {
        const errMsg = `Tool ${call.name} not found`;
        toolMessages.push(
          new ToolMessage({
            tool_call_id: call.id || call.name,
            content: JSON.stringify({ error: errMsg }),
          })
        );
        continue;
      }

      const timer = startTimer();
      try {
        const resultStr = await toolInstance.invoke(call.args as any);
        const durationMs = timer.stop();

        toolResults.push({
          toolName: call.name,
          input: call.args as Record<string, unknown>,
          output: resultStr,
          success: true,
          durationMs,
        });

        // Extract chunks if searchCode
        if (call.name === 'searchCode') {
          try {
            const parsed = JSON.parse(resultStr);
            if (parsed.chunks && Array.isArray(parsed.chunks)) {
              for (const c of parsed.chunks) {
                retrievedChunks.push({
                  filePath: c.filePath,
                  startLine: c.startLine,
                  endLine: c.endLine,
                  content: c.content,
                  score: c.score || 0,
                  language: c.language,
                });
              }
            }
          } catch {
            // Ignore parse error
          }
        }

        toolMessages.push(
          new ToolMessage({
            tool_call_id: call.id || call.name,
            content: typeof resultStr === 'string' ? resultStr : JSON.stringify(resultStr),
          })
        );
      } catch (err) {
        const durationMs = timer.stop();
        const errorMessage = err instanceof Error ? err.message : String(err);
        toolResults.push({
          toolName: call.name,
          input: call.args as Record<string, unknown>,
          output: errorMessage,
          success: false,
          durationMs,
        });

        toolMessages.push(
          new ToolMessage({
            tool_call_id: call.id || call.name,
            content: JSON.stringify({ error: errorMessage }),
          })
        );
      }
    }

    return {
      messages: toolMessages,
      toolResults,
      toolsUsed,
      retrievedChunks,
    };
  };

  // Node 3: Answer Formatter & Reference Extractor Node
  const answerFormatterNode = async (state: AgentStateType) => {
    const lastMessage = state.messages[state.messages.length - 1];
    let answerText = typeof lastMessage?.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage?.content || '');

    // Extract file references (e.g. "src/auth/jwt.ts:12-38" or "src/auth/jwt.ts")
    const references: FileReference[] = [];
    const refRegex = /([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)(?::(?:L)?(\d+)(?:-(\d+))?)?/g;
    let match: RegExpExecArray | null;

    while ((match = refRegex.exec(answerText)) !== null) {
      const file = match[1];
      // Filter out non-file tokens like http:// or numbers
      if (file.includes('/') || file.includes('.')) {
        const startLine = match[2] ? parseInt(match[2], 10) : undefined;
        const endLine = match[3] ? parseInt(match[3], 10) : startLine;

        // Skip markdown/urls
        if (!file.startsWith('http') && !file.endsWith('.com') && !file.endsWith('.org')) {
          references.push({ file, startLine, endLine });
        }
      }
    }

    // Also include references from retrieved chunks
    for (const chunk of state.retrievedChunks) {
      references.push({
        file: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
      });
    }

    // Deduplicate references
    const uniqueRefs: FileReference[] = [];
    const seen = new Set<string>();
    for (const r of references) {
      const key = `${r.file}:${r.startLine || 0}-${r.endLine || 0}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueRefs.push(r);
      }
    }

    return {
      finalAnswer: answerText,
      filesReferenced: uniqueRefs,
    };
  };

  // Router: Check if LLM requested tools
  const shouldContinue = (state: AgentStateType): string => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    if (lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      // Guard against infinite tool loops: limit to 6 iterations
      const toolMessageCount = state.messages.filter((m) => m instanceof ToolMessage).length;
      if (toolMessageCount < 6) {
        return 'tools';
      }
    }
    return 'format_answer';
  };

  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('format_answer', answerFormatterNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      format_answer: 'format_answer',
    })
    .addEdge('tools', 'agent')
    .addEdge('format_answer', END);

  const app = workflow.compile();

  return {
    async invoke(input: { repositoryId: string; question: string; messages?: BaseMessage[] }) {
      const initialMessages = input.messages || [new HumanMessage(input.question)];
      const result = await app.invoke({
        repositoryId: input.repositoryId,
        question: input.question,
        messages: initialMessages,
      });

      return {
        answer: result.finalAnswer || (result.messages[result.messages.length - 1]?.content as string) || '',
        references: result.filesReferenced || [],
        toolsUsed: result.toolsUsed || [],
        messages: result.messages || [],
      };
    },
  };
}
