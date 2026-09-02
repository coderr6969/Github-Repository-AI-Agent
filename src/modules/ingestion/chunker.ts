import { v4 as uuidv4 } from 'uuid';
import { CodeChunk } from '../../types/index.js';

export interface ChunkOptions {
  maxChunkLines?: number;
  minChunkLines?: number;
  overlapLines?: number;
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxChunkLines: 80,
  minChunkLines: 15,
  overlapLines: 15,
};

/**
 * Split source code into language-aware or line-aware chunks preserving accurate 1-indexed startLine and endLine.
 */
export function chunkSourceCode(
  repositoryId: string,
  filePath: string,
  language: string,
  content: string,
  branch = 'main',
  options: ChunkOptions = {}
): CodeChunk[] {
  if (!content || content.trim().length === 0) {
    return [];
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = content.split(/\r?\n/);
  const totalLines = lines.length;

  if (totalLines <= opts.maxChunkLines) {
    return [
      {
        chunkId: `${filePath}#L1-L${totalLines}`,
        repositoryId,
        filePath,
        language,
        startLine: 1,
        endLine: totalLines,
        branch,
        content: content.trim(),
      },
    ];
  }

  const chunks: CodeChunk[] = [];
  const boundaries = findLogicalBoundaries(lines, language);

  let currentStart = 0;

  while (currentStart < totalLines) {
    let idealEnd = currentStart + opts.maxChunkLines;
    if (idealEnd >= totalLines) {
      idealEnd = totalLines;
    } else {
      // Look for a logical boundary near the ideal end
      const boundaryNear = findClosestBoundary(boundaries, idealEnd, opts.minChunkLines, currentStart);
      if (boundaryNear !== null) {
        idealEnd = boundaryNear;
      }
    }

    const chunkLines = lines.slice(currentStart, idealEnd);
    const chunkText = chunkLines.join('\n').trim();

    if (chunkText.length > 0) {
      const startLine = currentStart + 1;
      const endLine = idealEnd;
      chunks.push({
        chunkId: `${filePath}#L${startLine}-L${endLine}`,
        repositoryId,
        filePath,
        language,
        startLine,
        endLine,
        branch,
        content: chunkText,
      });
    }

    if (idealEnd >= totalLines) {
      break;
    }

    // Advance start line using overlap
    const step = Math.max(1, (idealEnd - currentStart) - opts.overlapLines);
    currentStart += step;
  }

  return chunks;
}

/**
 * Identify line indices where logical code blocks start or end (functions, classes, exports, headers)
 */
function findLogicalBoundaries(lines: string[], language: string): number[] {
  const boundaries: number[] = [];

  const boundaryPatterns: Record<string, RegExp[]> = {
    javascript: [
      /^(?:export\s+)?(?:async\s+)?function\s+/i,
      /^(?:export\s+)?(?:class|interface|type|const|let|var)\s+/i,
      /^(?:export\s+default)/i,
    ],
    typescript: [
      /^(?:export\s+)?(?:async\s+)?function\s+/i,
      /^(?:export\s+)?(?:class|interface|type|enum|const|let|var)\s+/i,
      /^(?:export\s+default)/i,
    ],
    python: [
      /^(?:async\s+)?def\s+/i,
      /^class\s+/i,
      /^if\s+__name__\s*==\s*['"]__main__['"]:/,
    ],
    java: [
      /^(?:public|protected|private|static|\s)*class\s+/i,
      /^(?:public|protected|private|static|\s)*interface\s+/i,
      /^(?:public|protected|private|\s)+[\w<>\[\]]+\s+\w+\s*\(/i,
    ],
    go: [
      /^func\s+/i,
      /^type\s+\w+\s+struct/i,
      /^type\s+\w+\s+interface/i,
    ],
    rust: [
      /^(?:pub\s+)?fn\s+/i,
      /^(?:pub\s+)?struct\s+/i,
      /^(?:pub\s+)?enum\s+/i,
      /^(?:pub\s+)?impl\s+/i,
      /^(?:pub\s+)?trait\s+/i,
    ],
    markdown: [
      /^#{1,6}\s+/,
    ],
  };

  const patterns = boundaryPatterns[language] || [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Empty line boundary
    if (line === '') {
      boundaries.push(i);
      continue;
    }

    // Pattern match boundary
    for (const pat of patterns) {
      if (pat.test(lines[i])) {
        boundaries.push(i);
        break;
      }
    }
  }

  return boundaries;
}

function findClosestBoundary(
  boundaries: number[],
  target: number,
  minFromStart: number,
  start: number
): number | null {
  const window = 15; // +/- 15 lines flexibility
  let bestCandidate: number | null = null;
  let minDiff = Infinity;

  for (const b of boundaries) {
    if (b - start >= minFromStart && Math.abs(b - target) <= window) {
      const diff = Math.abs(b - target);
      if (diff < minDiff) {
        minDiff = diff;
        bestCandidate = b;
      }
    }
  }

  return bestCandidate;
}
