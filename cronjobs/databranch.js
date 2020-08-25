const fs = require('fs');
const path = require('path');

const {spawnAsync, spawnAsyncOrDie, makeTempDir} = require('./misc.js');

const GITHUB_REPOSITORY = 'aslushnikov/devops.aslushnikov.com';

class DataBranch {
  static async initialize(branch, cleanupHooks = []) {
    const checkoutPath = await makeTempDir('devops-data-dir-tmp-folder-', cleanupHooks);
    console.log(`[databranch] initializing at ${checkoutPath}`);
    let url = `https://github.com/${GITHUB_REPOSITORY}.git`;
    // Use github authentication if we have access to it.
    if (process.env.GITHUB_ACTOR && process.env.GITHUB_TOKEN)
      url = `https://${process.env.GITHUB_ACTOR}:${process.env.GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git`;

    await fs.promises.mkdir(checkoutPath, {recursive: true});
    // Check existance of a remote branch for this bot.
    const {stdout} = await spawnAsync('git', 'ls-remote', '--heads', url, branch);
    // If there is no remote branch for this bot - create one.
    if (!stdout.includes(branch)) {
      await spawnAsyncOrDie('git', 'clone', '--no-checkout', '--depth=1', url, checkoutPath);

      await spawnAsyncOrDie('git', 'checkout', '--orphan', branch, {cwd: checkoutPath});
      await spawnAsyncOrDie('git', 'reset', '--hard', {cwd: checkoutPath});
    } else {
      await spawnAsyncOrDie('git', 'clone', '--single-branch', '--branch', `${branch}`, '--depth=1', url, checkoutPath);
    }
    await spawnAsyncOrDie('git', 'config', 'user.email', `"github-actions@github.com"`, {cwd: checkoutPath});
    await spawnAsyncOrDie('git', 'config', 'user.name', `"github-actions"`, {cwd: checkoutPath});
    return new DataBranch(checkoutPath, branch);
  }

  constructor(checkoutPath, branch) {
    this._checkoutPath = checkoutPath;
    this._branch = branch;
  }

  async readJSON(filepath) {
    return JSON.parse(await this.readFile(filepath));
  }

  async readFile(filepath) {
    return await fs.promises.readFile(path.join(this._checkoutPath, filepath), 'utf8');
  }

  async writeFile(filepath, content) {
    return await fs.promises.writeFile(path.join(this._checkoutPath, filepath), content, 'utf8');
  }

  async writeJSON(filepath, content) {
    return await this.writeFile(filepath, JSON.stringify(content));
  }

  async upload(message = 'update data') {
    // Check if there's anything to update.
    const {stdout} = await spawnAsyncOrDie('git', 'status', '-s', '--untracked-files=all', {cwd: this._checkoutPath});
    if (!stdout.trim()) {
      console.log('[databranch] FYI: no changes, nothing to upload');
      return;
    }
    console.log(`[databranch] Uploading data with message "${message}"`);
    await spawnAsyncOrDie('git', 'add', '.', {cwd: this._checkoutPath});
    await spawnAsyncOrDie('git', 'commit', '-m', message, '--author', '"github-actions <github-actions@github.com>"', {cwd: this._checkoutPath});
    await spawnAsyncOrDie('git', 'push', 'origin', this._branch, {cwd: this._checkoutPath});
  }
}

module.exports = {DataBranch};
