# grunt-yabs

> Collection of tools for grunt release workflows.

Yet Another Build Script, &lt;sigh>, *why*? you ask...<br>
Because
- It comes with a set of useful tools like 'check', 'bump', 'commit', 'tag', 
  'push', 'run', 'npmPublish', ...
- It allows to define mini-workflows by running these tasks in arbitrary order
  with individual options.
- It's a multi-task, so multiple workflows can be defined.
- And mainly because it is *fun*. 
  [Join the project](https://github.com/mar10/grunt-yabs/blob/master/tasks/yabs.js) 
  if you like.

## Status
This is Work In Progress and barely tested. **Definitely not fit for production yet!**
Let me know if you find bugs or have suggestions.

Especially option defaults may change, so use dry-run mode after updating this 
plugin.


## Getting Started
This plugin requires Grunt `~0.4.5`

If you haven't used [Grunt](http://gruntjs.com/) before, be sure to check out the [Getting Started](http://gruntjs.com/getting-started) guide, as it explains how to create a [Gruntfile](http://gruntjs.com/sample-gruntfile) as well as install and use Grunt plugins. Once you're familiar with that process, you may install this plugin with this command:

```shell
npm install grunt-yabs --save-dev
```

Once the plugin has been installed, it may be enabled inside your Gruntfile with this line of JavaScript:

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
worflow definition right:
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
    workflow_1: {
      common: {
        // Default options for all tools in this workflow
      },
      check: { // The presence of this entry triggers the 'check' tool
        // Additional options for the 'check' tool
      },
      // ... more tools may be defined here ...
    },
    workflow_2: {
      // we can define more than one yabs target (i.e. workflow)
    },
  },
});
```


### Options

#### options.check.clean
Type: `Boolean`
Default value: `undefined`

Set to `true` or `false` to assert the repository has/has not uncommited changes.

TODO: more options here...


### Usage Examples

#### A Simple Workflow
A simple workflow may look like this

```js
grunt.initConfig({
  yabs: {
    release: {
      common: { // defaults for all tools
        manifests: ['package.json', 'testbower.json'],
        noWrite: true, // default to dry-run mode (remove this, when you are sure)
      },
      check: { clean: true, branch: ['master'] },
      bump: {}, // 'bump' uses the mode that was passed as `yabs:release:MODE`
      run: {tasks: ['compile', 'jshint:dist'] },
      commit: {},
      tag: {},
      push: {},
      // Tools may be executed multiple times (simply append '_something')
      bump_develop: { inc: 'prepatch' },
    }
  },
});
```
Use like
```shell
$ grunt yabs:release:patch
```

#### Available Options
Available tools and their default options:

```js
grunt.initConfig({
  yabs: {
    options: {
      // common default options for all targets (i.e. workflows)
    },
    // Define a workflow named 'release':
    release: {
      common: { // options used as default for all tools
        args: grunt.util.toArray(this.args), // Additional args after 'yabs:target:'
        verbose: !!grunt.option('verbose'),
        enable: true,
        noWrite: false,           // true enables dry-run
        manifests: ['package.json'], // First entry is 'master' for synchronizing
      },

      // The following tools are executed in order of appearance:

      // 'check': Assert preconditons and fail otherwise
      check: {
        clean: undefined,         // Repo must/must not contain modifications? 
        branch: ['master'],       // Current branch must be in this list
      },
      // 'bump': increment manifest.version and synchronize with other JSON files.
      bump: {
        // bump also requires a mode argmuent (yabs:target:MODE)
        inc: null,                // Used instead of 'yabs:target:MODE'
        syncVersion: true,        // Only increment master manifest, then copy version to secondaries
        syncFields: [],           // Synchronize entries from master to secondaries (if field exists)
        space: 2,                 // Used by JSON.stringify when files are written
        updateConfig: "pkg",      // Make sure pkg.version contains new value
      },
      // 'run': Run arbitrary grunt tasks (must be defined in the current Gruntfile)
      run: {
        tasks: [],
      },
      // 'commit': Commit all manifest files (and optionally others)
      commit: {
        add: "package.json",      // Also add these files ("." for all)
        message: 'Bumping version to {%= version %}',
      },
      // 'tag': Create a tag
      tag: {
        name: 'v{%= version %}',
        message: 'Version {%= version %}',
      },
      // 'push': push changes and tags
      push: {
        target: '',               // e.g. 'upstream',
        tags: false,              // Also 'push --tags'
      },
      // 'npmPublish': Submit to npm repository
      npmPublish: {
        message: 'Released {%= version %}',
      }
  }
});
```

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History
_(Nothing yet)_
