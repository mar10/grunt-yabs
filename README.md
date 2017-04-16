# grunt-yabs [![Built with Grunt](https://cdn.gruntjs.com/builtwith.png)](http://gruntjs.com/) [![Reference Status](https://www.versioneye.com/nodejs/grunt-yabs/reference_badge.svg?style=flat)](https://www.versioneye.com/nodejs/grunt-yabs/references)

> Collection of tools for grunt release workflows (using git).

[![Npm Downloads](https://nodei.co/npm/grunt-yabs.png?downloads=true&stars=true)](https://www.npmjs.org/package/grunt-yabs)

<b>Y</b>et <b>A</b>nother <b>B</b>uild <b>S</b>cript. *&lt;sigh>, why*? you ask...<br>
Because
- It comes with a set of useful tools like 'check', 'bump', 'commit', 'tag', 
  'push', 'run', 'npmPublish', 'githubRelease', ...
- Also any other tasks from your Gruntfile may be called.
- It allows to define mini-workflows by running these tasks in arbitrary order
  with individual options.
- It's a multi-task, so multiple different workflows can be defined.


## Status
[![NPM version](https://badge.fury.io/js/grunt-yabs.png)](#)

Production - *Should Work*.<br>
Let me know if you find bugs or have suggestions.<br>
[Review the code](https://github.com/mar10/grunt-yabs/blob/master/tasks/yabs.js)
if you like.

**Note:** Especially option defaults may change, so use dry-run mode after updating this 
plugin.


## Annotated Sample Workflow
A typical workflow definition may look like this:

```js
grunt.initConfig({
  yabs: {
    release: {
      // Define defaults for all tools in the 'release' workflow:
      common: { 
        // We want to update two manifest files (first is 'master')
        manifests: ['package.json', 'bower.json'],
      },
      // Define the activities of the 'release' worflow. The following tools are 
      // run in order of appearance.
      // If an activity fails, the workflow is stopped.
      // Every tool type has its own set of options and defaults.
      // Since keys must be unique, we have to append '_something' if a certain
      // tool type appears more than once. For example `bump` and `bump_develop`
      // are both tools of type 'bump'.

      // Run the jshint task with target 'dev'. (This assumes, that there is a
      // jshint task configured in this Gruntfile.)
      run_jshint: { tasks: ['jshint:dev'] },

      // Assert that we are on the main branch, and everything is commited
      // Do a dry-run push and make sure, that we are not behind the latest tag
      check: { branch: ['master'], canPush: true, clean: true, 
        cmpVersion: 'gt' },

      // Bump and synchronize `version` info in the manifests listed above.
      // 'bump' also uses the increment mode passed like 
      // `$ grunt yabs:release:MODE`
      bump: {},

      // Run some compile task (build, compress, LESS, ...) and jshint the 
      // result.
      // Any complex build task from your Gruntfile can be triggered here:
      run_build: { tasks: ['compile', 'jshint:dist'] },

      // `git commit` the changes
      commit: {},

      // Create an annotaded git tag
      tag: {},

      // `git push --follow-tags`
      push: { tags: true, useFollowTags: true },

      // Submit to npm repository
      npmPublish: {},

      // Use the GitHub API to publish a release
      githubRelease: { repo: 'mar10/grunt-yabs', draft: false },

      // Bump again for post release (e.g. 1.2.3 -> 1.2.4-0)
      bump_develop: { inc: 'prepatch' },

      // Commit and push the post release info
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
where `patch` is the increment mode that would bump 1.2.2 -> 1.2.3. (There is 
also `minor`, `major`, and others. See below.)

## Example output for [ui-contextmenu](https://github.com/mar10/jquery-ui-contextmenu/blob/master/Gruntfile.coffee):

```
$ cd <your project>
$ grunt yabs:release:patch
Running "yabs:release:patch" (yabs) task
>> Current branch "master" in allowed list: "master".
>> Repository is clean.
>> "git push" would succeed.
>> Current version (1.8.2-0) is `gte` latest tag (1.8.1).
Run task "test"...
Running "jshint:files" (jshint) task
>> 2 files lint free.

Running "jscs:src" (jscs) task
>> 2 files without code style errors.

Running "qunit:all" (qunit) task
Testing test/index.html .........OK
Testing test/index-jquery-ui-1-10.html .........OK
>> 148 assertions passed (10820ms)

Done, without errors.
>> Run task "test".
>> Updated config.pkg.version to 1.8.2
Bumping version in package.json from 1.8.2-0 to 1.8.2...OK
Bumping version in bower.json from 1.8.2-0 to 1.8.2...OK
Bumping version in ui-contextmenu.jquery.json from 1.8.2-0 to 1.8.2...OK
Run task "build"...
Running "exec:tabfix" (exec) task

Modified 0/2828 lines, 0/15 files in 263 folders, skipped: 0
         96837 bytes -> 96837 bytes (+0%), elapsed: 0.111 sec

Running "jshint:files" (jshint) task
>> 2 files lint free.

Running "jscs:src" (jscs) task
>> 2 files without code style errors.

Running "qunit:all" (qunit) task
Testing test/index.html .........OK
Testing test/index-jquery-ui-1-10.html .........OK
>> 148 assertions passed (11562ms)

Running "uglify:build" (uglify) task
>> 1 sourcemap created.
>> 1 file created.

Done, without errors.
>> Run task "build".
>> Commited "Bumping version to 1.8.2"
>> Current branch "master" in allowed list: "master".
>> Repository is clean.
>> Created tag v1.8.2: "Version 1.8.2"
>> Pushed  (with tags).
>> Created GitHub release mar10/jquery-ui-contextmenu v1.8.2.
>> Published to npm.
>> Updated config.pkg.version to 1.8.3-0
Bumping version in package.json from 1.8.2 to 1.8.3-0...OK
Bumping version in bower.json from 1.8.2 to 1.8.3-0...OK
Bumping version in ui-contextmenu.jquery.json from 1.8.2 to 1.8.3-0...OK
>> Commited "Bump prerelease (1.8.3-0) [ci skip]"
>> Pushed  (no tags).

Done, without errors.
$
```

See also 
[grunt-yabs](https://github.com/mar10/grunt-yabs/blob/master/Gruntfile.js),
[ui-contextmenu](https://github.com/mar10/jquery-ui-contextmenu/blob/master/Gruntfile.coffee),
[persisto](https://github.com/mar10/persisto/blob/master/Gruntfile.coffee),
and [Fancytree](https://github.com/mar10/fancytree/blob/master/Gruntfile.coffee) 
for real-world examples.


## Getting Started

This plugin requires Grunt `>=0.4.0`

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
number according to [semver](http://semver.org/).<br>
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
        manifests: ['package.json'], // First entry is master for synchronizing
      },

      // The following tools are available. They are executed in the order 
      // as they are added to the workflow object.

      // 'bump': increment manifest.version and synchronize other JSON files
      bump: {
        // bump also requires a mode argument (yabs:target:MODE)
        inc: null,              // Override 'yabs:target:MODE'
        space: 2,               // Indentation used when writing JSON files
        syncVersion: true,      // Only increment master manifest, then copy 
                                // version to secondaries
        syncFields: [],         // Synchronize entries from master to 
                                // secondaries (if field exists)
        updateConfig: 'pkg',    // Make sure pkg.version contains the new value
      },
      // 'check': Assert preconditons and fail otherwise
      check: {
        allowedModes: null,     // Optionally restrict yabs:target:MODE to this
                                   value(s). Useful for maintenance branches.
        branch: ['master'],     // Current branch must be in this list
        canPush: undefined,     // Test if 'git push' would/would not succeed
        clean: undefined,       // Repo must/must not contain modifications? 
        cmpVersion: null,       // E.g. set to 'gt' to assert that the current 
                                // version is higher than the latest tag (gt, 
                                // gte, lt, lte, eq, neq)
      },
      // 'commit': Commit modified files
      commit: {
        add: [],                // Also `git add` these files ('.' for all)
        addKnown: true,         // Commit with -a flag
        message: 'Bumping version to {%= version %}',
      },
      // 'githubRelease': Create a release on GitHub
      githubRelease: {
        repo: null,             // 'owner/repo'
        auth: {usernameVar: 'GITHUB_USERNAME', passwordVar: 'GITHUB_PASSWORD'},
        name: 'v{%= version %}',
        body: 'Released {%= version %}\n' +
            '[Commit details](https://github.com/{%= repo %}/compare/{%= currentTagName %}...{%= lastTagName %}).',
        draft: true,
        prerelease: false,
      },
      // 'npmPublish': Submit to npm repository
      npmPublish: {
        message: 'Released {%= version %}',
      },
      // 'push': Push changes and tags
      push: {
        target: '',             // E.g. 'upstream'
        tags: false,            // Also push tags
        useFollowTags: false,   // Use `--folow-tags` instead of `&& push --tags`
                                // (requires git 1.8.3+)
      },
      // 'run': Run arbitrary grunt tasks
      run: {
        tasks: [], // (Tasks must be defined in the current Gruntfile)
        silent: false,          // `true`: suppress output
      },
      // 'tag': Create an annotated tag
      tag: {
        name: 'v{%= version %}',
        message: 'Version {%= version %}',
      },
  }
});
```


## Contributing

In lieu of a formal styleguide, take care to maintain the existing coding style. 
Add unit tests for any new or changed functionality. Lint and test your code using 
[Grunt](http://gruntjs.com/).
