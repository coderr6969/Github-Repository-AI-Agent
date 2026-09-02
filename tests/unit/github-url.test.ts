import { describe, it, expect } from 'vitest';
import { parseGitHubUrl } from '../../src/utils/github-url.js';
import { ValidationError } from '../../src/utils/errors.js';

describe('parseGitHubUrl', () => {
  it('should parse standard HTTPS GitHub repository URLs', () => {
    const res = parseGitHubUrl('https://github.com/expressjs/express');
    expect(res).toEqual({
      owner: 'expressjs',
      repo: 'express',
      fullName: 'expressjs/express',
      url: 'https://github.com/expressjs/express',
    });
  });

  it('should parse URLs with trailing slashes', () => {
    const res = parseGitHubUrl('https://github.com/facebook/react/');
    expect(res.owner).toBe('facebook');
    expect(res.repo).toBe('react');
    expect(res.fullName).toBe('facebook/react');
  });

  it('should strip .git suffix', () => {
    const res = parseGitHubUrl('https://github.com/nodejs/node.git');
    expect(res.owner).toBe('nodejs');
    expect(res.repo).toBe('node');
    expect(res.fullName).toBe('nodejs/node');
  });

  it('should parse URLs with www or http', () => {
    const res = parseGitHubUrl('http://www.github.com/vercel/next.js');
    expect(res.owner).toBe('vercel');
    expect(res.repo).toBe('next.js');
  });

  it('should throw ValidationError for invalid non-github URLs', () => {
    expect(() => parseGitHubUrl('https://gitlab.com/owner/repo')).toThrow(ValidationError);
    expect(() => parseGitHubUrl('https://google.com')).toThrow(ValidationError);
    expect(() => parseGitHubUrl('invalid-url')).toThrow(ValidationError);
    expect(() => parseGitHubUrl('')).toThrow(ValidationError);
  });
});
