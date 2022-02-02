import { run } from '@jupyterlab/buildutils';

/**
 * Get the current version of RetroLab
 */
export function getPythonVersion(): string {
  const cmd = 'python setup.py --version';
  const lines = run(cmd, { stdio: 'pipe' }, true).split('\n');
  return lines[lines.length - 1];
}

export function postbump(commit = true): void {
  // run the integrity
  run('jlpm integrity');

  const newPyVersion = getPythonVersion();

  // Commit changes.
  if (commit) {
    run(`git commit -am "Release ${newPyVersion}"`);
    run(`git tag ${newPyVersion}`);
  }
}
