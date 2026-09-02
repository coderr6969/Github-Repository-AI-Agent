import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { FileReference, RetrievedChunk, ToolResult } from '../../types/index.js';

export const AgentStateAnnotation = Annotation.Root({
  repositoryId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  question: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  retrievedChunks: Annotation<RetrievedChunk[]>({
    reducer: (x, y) => {
      const combined = [...x, ...(y || [])];
      // Deduplicate by chunkId or filePath+startLine
      const seen = new Set<string>();
      return combined.filter((c) => {
        const key = `${c.filePath}#${c.startLine}-${c.endLine}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    default: () => [],
  }),
  filesReferenced: Annotation<FileReference[]>({
    reducer: (x, y) => {
      const combined = [...x, ...(y || [])];
      const seen = new Set<string>();
      return combined.filter((f) => {
        const key = `${f.file}:${f.startLine}-${f.endLine}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    default: () => [],
  }),
  toolResults: Annotation<ToolResult[]>({
    reducer: (x, y) => x.concat(y || []),
    default: () => [],
  }),
  toolsUsed: Annotation<string[]>({
    reducer: (x, y) => Array.from(new Set([...x, ...(y || [])])),
    default: () => [],
  }),
  finalAnswer: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
});

export type AgentStateType = typeof AgentStateAnnotation.State;
