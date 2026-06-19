import path from 'path';

export function resolveInside(rootDir: string, ...segments: string[]): string | null {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...segments);
  const relative = path.relative(root, target);

  if (relative === '') {
    return target;
  }

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return target;
}

export function safeFileName(fileName: string): string {
  return path.basename(fileName).replace(/\s+/g, '_');
}
