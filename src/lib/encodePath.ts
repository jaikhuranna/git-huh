/** Encode each segment of a repository path, leaving the slashes intact. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
