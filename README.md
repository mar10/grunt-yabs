# grunt-yabs [![Built with Grunt](https://cdn.gruntjs.com/builtwith.png)](http://gruntjs.com/)

> Collection of tools for grunt release workflows.

[![Npm Downloads](https://nodei.co/npm/grunt-yabs.png?downloads=true&stars=true)](https://www.npmjs.org/package/grunt-yabs)

<b>Y</b>et <b>A</b>nother <b>B</b>uild <b>S</b>cript. *&lt;sigh>, why*? you ask...<br>
Because
- It comes with a set of useful tools like 'check', 'bump', 'commit', 'tag', 
  'push', 'run', 'npmPublish', 'githubRelease', ...
- Also other tasks from your gruntfile may be called as part of the workflow.
- It allows to define mini-workflows by running these tasks in arbitrary order
  with individual options.
- It's a multi-task, so multiple workflows can be defined.


## Status
[![NPM version](https://badge.fury.io/js/grunt-yabs.png)](#)

Beta - *Might Work*.<br>
Let me know if you find bugs or have suggestions.<br>
[Review the code](https://github.com/mar10/grunt-yabs/blob/master/tasks/yabs.js)
if you like.

**Note:** Especially option defaults may change, so use dry-run mode after updating this 
plugin.


## A Plain Sample Workflow
A simple workflow definition may look like this:

```js
grunt.initConfig({
  yabs: {
    release: {
      common: { // defaults for all tools
        manifests: ['package.json', 'bower.json'],
      },
      // The following tools are run in the configured order:
      run_jshint: { tasks: ['jshint:dev'] },
      check: { clean: true, branch: ['master'] },
      bump: {}, // 'bump' also uses the increment mode `yabs:release:MODE`
      run_build: { tasks: ['compile', 'jshint:dist'] },
      commit: {},
      tag: {},
      push: { tags: true },
      githubRelease: { repo: 'fooser/barapp', draft: false },
      // Tools may be executed multiple times (simply append '_something')
      bump_develop: { inc: 'prepatch' },
      commit_develop: { message: 'Bump prerelease ({%= version %}) [ci skip]' },
      push_develop: {},
    }
  },
});
```
The above workflow is triggered like this:
```shell
$ grunt yabs:release:patch
```


## Getting Started
This plugin requires Grunt `~0.4.5`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-yabs --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with 
this line of JavaScript:

```js
grunt.loadNpmTasks('grunt-yabs');
```

Now go and configure the `yabs` section in your `package.json` file (see next
section).

After that you are ready to use it inside your script or run it directly from the
command line:
```shell
$ grunt yabs:WORKFLOW:MODE
```
Valid modes are `major`, `minor`, `patch`, `prerelease` to increment the version
number according to semver.<br>
`premajor`, `preminor`, `prepatch` can be used to prepare post-release versions.<br>
Use `zero` to *not* bump the version number, but only synchronize the current 
fields with secondary manifests.

I highly recommend to **use the dry-run mode first**, to make sure you got your 
worflow definition right:
```shell
$ grunt yabs:myworkflow:patch --no-write
```
If something goes wrong, increase the debug level to investigate:
```shell
$ grunt yabs:myworkflow:patch --no-write --vebose
```

## The "yabs" task

### Overview
In your project's Gruntfile, add a section named `yabs` to the data object 
passed into `grunt.initConfig()`.

```js
grunt.initConfig({
  yabs: {
    options: {
      common: { 
        // Defaults for all tools in all workflows may go here
      },
      check: {
        // For example 'check' and 'check_...' tools always use this defaults
      },
    },

    workflow_1: {
      common: {
        // Default options for all tools in workflow_1
      },
      check: { // The presence of this entry triggers the 'check' tool
        // Specific options for the 'check' tool
      },
      // ... more tools may be defined here ...
      // The `run` tool executes grunt tasks 
      run: {tasks: ['compile', 'jshint:dist'] },
      // Tools may be executed multiple times (simply append '_something')
      check_develop: { ... },
    },

    workflow_2: {
      // We can define more than one yabs target
    },
  },
});
```

The above workflow is triggered like this:
```shell
$ grunt yabs:workflow_1:patch
```
where `patch` may be replaced with one of the supported modes mentioned above.

<!--
### Options

#### options.check.clean
Type: `Boolean`
Default value: `undefined`

Set to `true` or `false` to assert the repository has/has not uncommited changes.

TODO: more options here...
For now see section "Available Options" below.
### Usage Examples
-->

### Available Options
Available tools and their default options:

```js
grunt.initConfig({
  yabs: {
    options: {
      // Common default options for all targets (i.e. workflows)
      common: { 
        // Defaults for all tools in all workflows may go here
      },
      bump: {
        // For example 'bump' and 'bump_...' tools should  use this options as 
        // default in all workflows...
      },
    },
    // Define a workflow named 'release':
    release: {
      // Options used as default for all tools in the 'release' workflow
      common: {
        enable: true,
        noWrite: false,              // `true` enables dry-run (note: 
                                     // `--no-write` is always honored)
        manifests: ['package.json'], // First entry is master for synchronizing
      },

      // The following tools are executed in order of appearance:

      // 'check': Assert preconditons and fail otherwise
      check: {
        branch: ['master'],     // Current branch must be in this list
        canPush: undefined,     // Test if 'git push' would/would not succeed
        clean: undefined,       // Repo must/must not contain modifications? 
      },
      // 'bump': increment manifest.version and synchronize other JSON files
      bump: {
        // bump also requires a mode argument (yabs:target:MODE)
        inc: null,              // Override 'yabs:target:MODE'
        syncVersion: true,      // Only increment master manifest, then copy 
                                // version to secondaries
        syncFields: [],         // Synchronize entries from master to 
                                // secondaries (if field exists)
        space: 2,               // Indentation used when writing JSON files
        updateConfig: 'pkg',    // Make sure pkg.version contains the new value
      },
      // 'run': Run arbitrary grunt tasks
      run: {
        tasks: [], // (Tasks must be defined in the current Gruntfile)
        silent: false,          // `true`: suppress output
      },
      // 'commit': Commit modified files
      commit: {
        add: [],                // Also `git add` these files ('.' for all)
        addKnown: true,         // Commit with -a flag
        message: 'Bumping version to {%= version %}',
      },
      // 'tag': Create an annotated tag
      tag: {
        name: 'v{%= version %}',
        message: 'Version {%= version %}',
      },
      // 'push': Push changes and tags
      push: {
        target: '',             // E.g. 'upstream'
        tags: false,            // Also push tags
        useFollowTags: false,   // Use `--folow-tags` instead of `&& push --tags`
      },
      // 'npmPublish': Submit to npm repository
      npmPublish: {
        message: 'Released {%= version %}',
      },
      // 'githubRelease': Create a release on GitHub
      githubRelease: {
        repo: null,             // 'owner/repo'
        auth: {usernameVar: 'GITHUB_USERNAME', passwordVar: 'GITHUB_PASSWORD'},
        name: 'v{%= version %}',
        body: 'Released {%= version %}',
        draft: true,
        prerelease: false,
      },
  }
});
```

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. 
Add unit tests for any new or changed functionality. Lint and test your code using 
[Grunt](http://gruntjs.com/).

## Release History
* 2014-06-20   v0.0.0   Work in progress, use at your own risk.
