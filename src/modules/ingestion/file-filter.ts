import path from 'path';

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  '.nyc_output',
  'target',
  'bin',
  'obj',
  'vendor',
  '.idea',
  '.vscode',
  '.github',
  'coverage',
]);

const IGNORED_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
  'poetry.lock',
  '.DS_Store',
  'Thumbs.db',
]);

const IGNORED_EXTENSIONS = new Set([
  // Binaries and compiled
  '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a', '.class', '.pyc', '.pyo',
  // Archives
  '.zip', '.tar', '.gz', '.tgz', '.rar', '.7z', '.bz2',
  // Media
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.bmp', '.mp4', '.mp3', '.wav', '.avi', '.mov',
  // Fonts & Documents
  '.pdf', '.doc', '.docx', '.woff', '.woff2', '.ttf', '.eot', '.otf',
  // Source maps
  '.map',
]);

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  // JavaScript & TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  // Python
  '.py': 'python',
  '.pyw': 'python',
  // Java
  '.java': 'java',
  // C / C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  // Go
  '.go': 'go',
  // Rust
  '.rs': 'rust',
  // SQL
  '.sql': 'sql',
  // Web
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'css',
  '.sass': 'css',
  '.less': 'css',
  // Data formats
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  // Documentation
  '.md': 'markdown',
  '.markdown': 'markdown',
  // Others
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.rb': 'ruby',
  '.php': 'php',
};

export function isIgnoredPath(filePath: string): boolean {
  if (!filePath) return true;

  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  const fileName = segments[segments.length - 1];

  // Check directories in path
  for (const seg of segments.slice(0, -1)) {
    if (IGNORED_DIRECTORIES.has(seg)) {
      return true;
    }
  }

  // Check exact file names
  if (IGNORED_FILES.has(fileName)) {
    return true;
  }

  // Check file extensions
  const ext = path.extname(fileName).toLowerCase();
  if (IGNORED_EXTENSIONS.has(ext)) {
    return true;
  }

  // Minified files
  if (fileName.endsWith('.min.js') || fileName.endsWith('.min.css')) {
    return true;
  }

  return false;
}

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (LANGUAGE_EXTENSIONS[ext]) {
    return LANGUAGE_EXTENSIONS[ext];
  }

  const base = path.basename(filePath).toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  if (base.startsWith('.env')) return 'dotenv';

  return 'plaintext';
}

export function isSupportedSourceFile(filePath: string): boolean {
  if (isIgnoredPath(filePath)) {
    return false;
  }
  const lang = detectLanguage(filePath);
  return lang !== 'plaintext' && lang !== 'unknown';
}
