import { describe, it, expect } from 'vitest';
import { chunkSourceCode } from '../../src/modules/ingestion/chunker.js';

describe('chunkSourceCode', () => {
  it('should return a single chunk for small source files with exact line numbers', () => {
    const code = `import jwt from 'jsonwebtoken';

export function createToken() {
  return 'token';
}`;

    const chunks = chunkSourceCode('repo-1', 'src/auth/jwt.ts', 'typescript', code, 'main');
    expect(chunks.length).toBe(1);
    expect(chunks[0].filePath).toBe('src/auth/jwt.ts');
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(5);
    expect(chunks[0].chunkId).toBe('src/auth/jwt.ts#L1-L5');
    expect(chunks[0].content).toBe(code);
  });

  it('should split larger files into multiple chunks while preserving 1-indexed start/end lines', () => {
    const lines = [];
    for (let i = 1; i <= 200; i++) {
      if (i % 20 === 0) {
        lines.push(`export function func${i}() {\n  return ${i};\n}`);
      } else {
        lines.push(`const var${i} = ${i};`);
      }
    }
    const longCode = lines.join('\n');

    const chunks = chunkSourceCode('repo-1', 'src/big.ts', 'typescript', longCode, 'main', {
      maxChunkLines: 50,
      overlapLines: 10,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBeLessThanOrEqual(65);

    // Verify all chunks have valid start and end lines
    for (const c of chunks) {
      expect(c.startLine).toBeGreaterThanOrEqual(1);
      expect(c.endLine).toBeGreaterThan(c.startLine);
      expect(c.content.length).toBeGreaterThan(0);
    }
  });

  it('should handle empty or whitespace-only code gracefully', () => {
    expect(chunkSourceCode('repo-1', 'empty.ts', 'typescript', '')).toEqual([]);
    expect(chunkSourceCode('repo-1', 'empty.ts', 'typescript', '   \n\n  ')).toEqual([]);
  });
});
