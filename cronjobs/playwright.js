const fs = require('fs');
const path = require('path');

const misc = require('./misc.js');

const GITHUB_REPOSITORY = 'microsoft/playwright';

class GitRepo {
  constructor(checkoutPath) {
    this._checkoutPath = checkoutPath;
  }

  filepath(gitpath) {
    return path.join(this._checkoutPath, gitpath);
  }

  async commitHistory(gitpath) {
    const {stdout} = await misc.spawnAsyncOrDie('git', 'log', '--follow', '--format=%H %ct %s', gitpath, {cwd: this._checkoutPath});
    return stdout.trim().split('\n').map(parseCommitString);
  }

  async exists(gitpath) {
    return await fs.promises.stat(this.filepath(gitpath)).then(() => true).catch(e => false);
  }

  async checkoutRevision(sha) {
    await misc.spawnAsyncOrDie('git', 'checkout', sha, {cwd: this._checkoutPath});
  }

  async rebase(sha) {
    await misc.spawnAsyncOrDie('git', 'rebase', sha, {cwd: this._checkoutPath});
  }

  async getCommit(ref) {
    const {stdout} = await misc.spawnAsyncOrDie('git', 'show', '-s', '--format=%H %ct %s', ref, {cwd: this._checkoutPath});
    return parseCommitString(stdout.trim());
  }
}

function parseCommitString(line) {
  line = line.trim();
  const tokens = line.split(' ');
  const sha = tokens.shift();
  const timestamp = tokens.shift();
  const message = tokens.join(' ');
  return {sha, timestamp, message};
}


class Playwright extends GitRepo {
  static async clone(cleanupHooks, options = {}) {
    const {
      fullHistory = false,
    } = options;
    const checkoutPath = await misc.makeTempDir('devops-playwright-checkout-', cleanupHooks);
    console.log(`[playwright] cloning Playwright at ${checkoutPath}`);
    const cloneOptions = [
      '--single-branch',
      '--branch', 'master',
    ];
    if (!fullHistory)
      cloneOptions.push('--depth=1');
    await misc.spawnAsyncOrDie('git', 'clone', ...cloneOptions, 'https://github.com/microsoft/playwright.git', checkoutPath);
    return new Playwright(checkoutPath);
  }

  async prepareBrowserCheckout(browserName) {
    if (browserName !== 'firefox' && browsername !== 'webkit')
      throw new Error('Unknown browser: ' + browserName);
    console.log(`[playwright] preparing ${browserName} checkout`);
    await misc.spawnAsyncOrDie(this.filepath('browser_patches/prepare_checkout.sh'), browserName, {cwd: this._checkoutPath});
    return new BrowserCheckout(browserName, this.filepath(`browser_patches/${browserName}/checkout`));
  }

  async webkitProtocol() {
    const {stdout} = await misc.spawnAsyncOrDie('node', this.filepath('browser_patches/webkit/concat_protocol.js'), {cwd: this._checkoutPath});
    return stdout;
  }

  async firefoxProtocol() {
    return await fs.promises.readFile(this.filepath('browser_patches/firefox/juggler/protocol/Protocol.js'), 'utf8');
  }

  async wkBuildNumber() {
    return parseInt((await fs.promises.readFile(this.filepath('browser_patches/webkit/BUILD_NUMBER'), 'utf8')).split('\n')[0], 10);
  }

  async ffBuildNumber() {
    return parseInt((await fs.promises.readFile(this.filepath('browser_patches/firefox/BUILD_NUMBER'), 'utf8')).split('\n')[0], 10);
  }

  async installDependencies() {
    console.log(`[playwright] installing dependencies`);
    await misc.spawnAsyncOrDie('npm', 'install', {
      cwd: this._checkoutPath,
    });
  }

  async buildProject() {
    console.log(`[playwright] building project`);
    await misc.spawnAsyncOrDie('npm', 'run', 'build', {
      cwd: this._checkoutPath,
    });
  }
}

class BrowserCheckout extends GitRepo {
  constructor(browserName, checkoutPath) {
    super(checkoutPath);
    this._browserName = browserName;
    this._checkoutPath = checkoutPath;
    if (browserName === 'firefox')
      this._browserUpstreamRef = 'browser_upstream/beta';
    else if (browserName === 'webkit')
      this._browserUpstreamRef = 'browser_upstream/master';
    else
      throw new Error('ERROR: unknown browser to create checkout - ' + browserName);
  }

  browserUpstreamRef() {
    return this._browserUpstreamRef;
  }

  async buildBrowser() {
    if (this._browserName === 'webkit') {
      await misc.spawnAsyncOrDie('Tools/gtk/install-dependencies', { cwd: this._checkoutPath });
      await misc.spawnAsyncOrDie('Tools/wpe/install-dependencies', { cwd: this._checkoutPath });
      await misc.spawnAsyncOrDie('Tools/Scripts/update-webkitwpe-libs', { cwd: this._checkoutPath });
      await misc.spawnAsyncOrDie('Tools/Scripts/update-webkitgtk-libs', { cwd: this._checkoutPath });
    } else if (this._browserName === 'firefox') {
      await misc.spawnAsyncOrDie('./mach', 'bootstrap', '--no-interactive', '--application-choice="Firefox for Desktop"', {
        cwd: this._checkoutPath,
        env: Object.assign({}, process.env, {SHELL: '/bin/bash'}),
      });
    } else {
      throw new Error('ERROR: unknown browser! ' + this._browserName);
    }
    await misc.spawnAsyncOrDie(`../build.sh`, {
      cwd: this._checkoutPath,
      env: Object.assign({}, process.env, {SHELL: '/bin/bash'}),
    });
  }

  executablePath() {
    if (this._browserName === 'firefox')
      return this.filepath(`obj-build-playwright/dist/bin/firefox`);
    if (this._browserName === 'webkit')
      return this.filepath(`../pw_run.sh`);
    throw new Error('ERROR: cannot get executable path - I do not know this browser!');
  }
}

module.exports = {Playwright};