/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

/**
 * Inspired by: https://github.com/jupyterlab/jupyterlab/blob/master/buildutils/src/bumpversion.ts
 */

import * as utils from '@jupyterlab/buildutils';

import commander from 'commander';

import { postbump } from './utils';

// Specify the program signature.
commander
  .description('Update the version')
  .option('--dry-run', 'Dry run')
  .option('--force', 'Force the upgrade')
  .option('--skip-commit', 'Whether to skip commit changes')
  .arguments('<spec>')
  .action((spec: any, opts: any) => {
    // Get the previous version.
    const prev = utils.getPythonVersion();

    // Whether to commit after bumping
    const commit = opts.skipCommit !== true;

    // For patch, defer to `patch:release` command
    if (spec === 'patch') {
      let cmd = 'jlpm run release:patch';
      if (opts.force) {
        cmd += ' --force';
      }
      if (opts.skipCommit) {
        cmd += ' --skip-commit';
      }
      utils.run(cmd);
      process.exit(0);
    }

    // Make sure we have a valid version spec.
    const options = ['major', 'minor', 'release', 'build'];
    if (options.indexOf(spec) === -1) {
      throw new Error(`Version spec must be one of: ${options}`);
    }
    if (
      prev.indexOf('a') === -1 &&
      prev.indexOf('b') === -1 &&
      prev.indexOf('rc') === -1 &&
      spec === 'release'
    ) {
      throw new Error('Use "major" or "minor" to switch back to alpha release');
    }
    if (
      prev.indexOf('a') === -1 &&
      prev.indexOf('b') === -1 &&
      prev.indexOf('rc') === -1 &&
      spec === 'build'
    ) {
      throw new Error('Cannot increment a build on a final release');
    }

    // Run pre-bump script.
    utils.prebump();

    // Handle dry runs.
    if (opts.dryRun) {
      utils.run(`bumpversion --dry-run --verbose ${spec}`);
      return;
    }

    // If this is a major release during the alpha cycle, bump
    // just the Python version.
    if (prev.indexOf('a') !== -1 && spec === 'major') {
      // Bump the version.
      utils.run(`bumpversion ${spec}`);

      // Run the post-bump script.
      postbump(commit);

      return;
    }

    // Determine the version spec to use for lerna.
    let lernaVersion = 'preminor';
    if (spec === 'build') {
      lernaVersion = 'prerelease';
      // a -> b
    } else if (spec === 'release' && prev.indexOf('a') !== -1) {
      lernaVersion = 'prerelease --preid=beta';
      // b -> rc
    } else if (spec === 'release' && prev.indexOf('b') !== -1) {
      lernaVersion = 'prerelease --preid=rc';
      // rc -> final
    } else if (spec === 'release' && prev.indexOf('rc') !== -1) {
      lernaVersion = 'patch';
    }
    if (lernaVersion === 'preminor') {
      lernaVersion += ' --preid=alpha';
    }

    let cmd = `jlpm run lerna version --force-publish --no-push --no-git-tag-version ${lernaVersion}`;
    if (opts.force) {
      cmd += ' --yes';
    }
    // For a preminor release, we bump 10 minor versions so that we do
    // not conflict with versions during minor releases of the top
    // level package.
    if (lernaVersion === 'preminor') {
      for (let i = 0; i < 10; i++) {
        utils.run(cmd);
      }
    } else {
      utils.run(cmd);
    }

    // Bump the version.
    utils.run(`bumpversion ${spec} --allow-dirty`);

    // Run the post-bump script.
    postbump(commit);
  });

commander.parse(process.argv);
