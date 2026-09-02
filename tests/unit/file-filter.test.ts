import { describe, it, expect } from 'vitest';
import { isIgnoredPath, detectLanguage, isSupportedSourceFile } from '../../src/modules/ingestion/file-filter.js';

describe('file-filter & language detection', () => {
  describe('isIgnoredPath', () => {
    it('should ignore git and dependencies folders', () => {
      expect(isIgnoredPath('.git/config')).toBe(true);
      expect(isIgnoredPath('node_modules/express/index.js')).toBe(true);
      expect(isIgnoredPath('dist/bundle.js')).toBe(true);
      expect(isIgnoredPath('build/output.js')).toBe(true);
      expect(isIgnoredPath('.next/server.js')).toBe(true);
    });

    it('should ignore lockfiles and media binaries', () => {
      expect(isIgnoredPath('package-lock.json')).toBe(true);
      expect(isIgnoredPath('yarn.lock')).toBe(true);
      expect(isIgnoredPath('logo.png')).toBe(true);
      expect(isIgnoredPath('assets/video.mp4')).toBe(true);
      expect(isIgnoredPath('document.pdf')).toBe(true);
      expect(isIgnoredPath('main.exe')).toBe(true);
    });

    it('should allow regular source files', () => {
      expect(isIgnoredPath('src/auth/jwt.ts')).toBe(false);
      expect(isIgnoredPath('src/app.py')).toBe(false);
      expect(isIgnoredPath('README.md')).toBe(false);
      expect(isIgnoredPath('package.json')).toBe(false);
    });
  });

  describe('detectLanguage', () => {
    it('should detect languages accurately by extension', () => {
      expect(detectLanguage('index.ts')).toBe('typescript');
      expect(detectLanguage('index.tsx')).toBe('typescript');
      expect(detectLanguage('server.js')).toBe('javascript');
      expect(detectLanguage('main.py')).toBe('python');
      expect(detectLanguage('App.java')).toBe('java');
      expect(detectLanguage('main.go')).toBe('go');
      expect(detectLanguage('lib.rs')).toBe('rust');
      expect(detectLanguage('schema.sql')).toBe('sql');
      expect(detectLanguage('style.css')).toBe('css');
      expect(detectLanguage('data.json')).toBe('json');
      expect(detectLanguage('config.yaml')).toBe('yaml');
      expect(detectLanguage('README.md')).toBe('markdown');
      expect(detectLanguage('Dockerfile')).toBe('dockerfile');
    });
  });

  describe('isSupportedSourceFile', () => {
    it('should accept valid source files and reject binaries/ignored files', () => {
      expect(isSupportedSourceFile('src/auth.ts')).toBe(true);
      expect(isSupportedSourceFile('node_modules/lodash/index.js')).toBe(false);
      expect(isSupportedSourceFile('image.png')).toBe(false);
    });
  });
});
