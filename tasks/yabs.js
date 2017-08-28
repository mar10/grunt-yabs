/*
 * grunt-yabs
 * https://github.com/martin/grunt-yabs
 *
 * Collection of tools for grunt release workflows.
 *
 * This plugin is inspired by and borrows from existing grunt plugins, mainly
 *   - https://github.com/gruntjs/grunt-contrib-bump
 *   - https://github.com/vojtajina/grunt-bump
 *   - https://github.com/geddski/grunt-release
 *   - https://github.com/Darsain/grunt-checkrepo
 *   - https://github.com/dymonaz/grunt-checkbranch
 *
 * Copyright (c) 2014-2017 Martin Wendt
 * Licensed under the MIT license.
 */

'use strict';

var Applause = require('applause');
var lodash = require('lodash');
var Q = require('q');
var request = require('superagent');
var semver = require('semver');
var shell = require('shelljs');


module.exports = function(grunt) {

  var _ = lodash;
  var tool_handlers = {};
  var KNOWN_TOOLS = 'bump check commit exec githubRelease npmPublish push replace run tag'.split(' ');
  var KNOWN_ARGS = '--debug --force --no-color --no-write --npm --stack --tasks --verbose'.split(' ');
  var DEFAULT_OPTIONS = {
    common: { // options used as default for all tools
      args: _.toArray(this.args), // Additional args after 'yabs:target:'
      verbose: !!grunt.option('verbose'),
      enable: true,             //
      noWrite: false,           // true enables dry-run
      manifests: ['package.json'], // First entry is 'master' for synchronizing
    },

    // The following tools are executed in order of appearance:

    // 'check': Assert preconditons and fail otherwise
    check: {
      allowedModes: null,       // Optionally restrict yabs:target:MODE to this
                                // value(s). Useful for maintenance branches.
      branch: ['master'],       // Current branch must be in this list
      canPush: undefined,       // Test if 'git push' would/would not succeed
      clean: undefined,         // Repo must/must not contain modifications?
      cmpVersion: null,         // E.g. set to 'gt' to assert that the current
                                // version is higher than the latest tag (gt,
                                // gte, lt, lte, eq, neq)
//      allowDirty: [],
//      isPrerelease: undefined,
    },
    // 'replace': In-place string replacements (uses https://github.com/outaTiME/applause).
    replace: {
      files: null,              // minimatch globbing pattern
      patterns: [],             // See https://github.com/outaTiME/applause
      // Shortcut patterns (pass false to disable):
      setTimestamp: "{%= grunt.template.today('isoUtcDateTime') %}",
                                    // Replace '@@timestamp' with current time
      setVersion: '{%= version %}', // Replace '@@version' with current version
    },
    // 'bump': increment manifest.version and synchronize with other JSON files.
    bump: {
      // bump also requires a mode argmuent (yabs:target:MODE)
      inc: null,                // Used instead of 'yabs:target:MODE'
      syncVersion: true,        // Only increment master manifest, then copy version to secondaries
      syncFields: [],           // Synchronize entries from master to secondaries (if field exists)
      space: 2,                 // Used by JSON.stringify when files are written
      updateConfig: 'pkg',      // Make sure pkg.version contains new value
    },
    // 'run': Run arbitrary grunt tasks (must be defined in the current Gruntfile)
    run: {
      tasks: [],
      silent: false,            // `true`: suppress output
    },
    // 'commit': Commit all manifest files (and optionally others)
    commit: {
      add: [],                  // Also `git add` these files ('.' for all)
      addKnown: true,           // Commit with -a flag
      message: 'Bump version to {%= version %}',
    },
    // 'tag': Create a tag
    tag: {
      name: 'v{%= version %}',
      message: 'Version {%= version %}',
    },
    // 'push': push changes and tags
    push: {
      target: '',               // E.g. 'upstream'
      tags: false,              // Also push tags
      useFollowTags: false,     // Use `--folow-tags` instead of `&& push --tags`
                                // (requires git 1.8.3+)
    },
    // 'npmPublish': Submit to npm repository
    npmPublish: {
//    tag: null,
      message: 'Release {%= version %}',
    },
    // 'githubRelease': Create a release on GitHub
    githubRelease: {
      repo: null, // 'owner/repo'
      auth: {usernameVar: 'GITHUB_USERNAME', passwordVar: 'GITHUB_PASSWORD'},
//    tagName: 'v1.0.0',
//    targetCommitish: null, //'master',
      name: 'v{%= version %}',
      body: 'Release {%= version %}\n' +
          '[Commit details](https://github.com/{%= repo %}/compare/{%= currentTagName %}...{%= lastTagName %}).',
      draft: true,
      prerelease: false,
//    files: [],
    },
  };

  if (!shell.which('git')) {
    grunt.fail.fatal('This script requires git');
    return false;
  }
  /** Convert opts.name to an array if not already. */
  function makeArrayOpt(opts, name) {
    if( !Array.isArray(opts[name]) ) {
      opts[name] = [ opts[name] ];
    }
    return opts[name];
  }

  // Using custom delimiters keeps templates from being auto-processed.
  grunt.template.addDelimiters('yabs', '{%', '%}');
  function processTemplate(message, data) {
    return grunt.template.process(message, {
      delimiters: 'yabs',
      data: data
    });
  }

  /** Given str of "a/b", If n is 1, return "a" otherwise "b". */
  function pluralize(n, str, separator) {
    var parts = str.split(separator || '/');
    return n === 1 ? (parts[0] || '') : (parts[1] || '');
  }

  /** Read .json file (once) and store in cache. */
  function readJsonCached(cache, filepath, reload){
    if( reload || !cache[filepath] ) {
      cache[filepath] = grunt.file.readJSON(filepath);
    }
    return cache[filepath];
  }

  /** Execute shell command (synchronous). */
  function exec(opts, cmd, extra) {
    extra = extra || {};
    var silent = (extra.silent !== false); // Silent, unless explicitly passed `false`
    if ( opts.noWrite && extra.always !== true) {
      grunt.log.writeln('DRY-RUN: would exec: ' + cmd);
    } else {
      grunt.verbose.writeln('Running: ' + cmd);
      var result = shell.exec(cmd, {silent: silent});

      // grunt.verbose.writeln('exec(' + cmd + ') returning code ' + result.code +
      //   ', result: ' + result.stdout);
      if (extra.checkResultCode !== false && result.code !== 0) {
        grunt.fail.warn('exec(' + cmd + ') failed with code ' + result.code +
          ':\n' + result.stdout);
      }else{
        return result;
      }
    }
  }

  /** Return (and store) name of latest repository tag ('0.0.0' if none found) */
  function getCurrentTagNameCached(opts, data, reload){
    if( reload || !data.currentTagName ) {
      // Get new tags from the remote
      var result = exec(opts, 'git fetch --tags', {always: true});
      // #3: check if we have any tags
      result = exec(opts, 'git tag --list', {always: true});

      if( result.stdout.trim() === '' ) {
        data.currentTagName = "v0.0.0";
        grunt.log.warn('Repository does not have any tags: assuming "' + data.currentTagName + '"');
      } else {
        // Get the latest tag name
        result = exec(opts, 'git rev-list --tags --max-count=1', {always: true});
        result = exec(opts, 'git describe --tags ' + result.stdout.trim(), {always: true});
        result = result.stdout.trim();
        // data.currentTagName = semver.valid(result);
        data.currentTagName = result;
      }
    }
    return data.currentTagName;
  }

  /** Call tool handler with its aggregated options. */
  function makeToolRunner(tooltype, toolname, toolOptions, data) {
    return function(){
      var dispData = _.cloneDeep(data);
      var deferred = Q.defer();

      // dispData.masterManifest = '...';
      if( toolOptions.enable ) {
        grunt.verbose.writeln('Running "' + toolname +
          '" tool with opts=' + JSON.stringify(toolOptions) +
          ', data=' + JSON.stringify(dispData) + '...');
        tool_handlers[tooltype](deferred, toolOptions, data);
        data.completedTools.push(toolname);
      }else{
        grunt.verbose.writeln('"' + toolname + '" tool is disabled.');
        deferred.resolve();
      }
      return deferred.promise;
    };
  }

  /*****************************************************************************
   *
   * The yabs multi-task
   */
  grunt.registerMultiTask('yabs', 'Collection of tools for grunt release workflows.', function() {

    var start = Date.now();
    var taskOpts = grunt.config(this.name);   // config.yabs
    var workflowOpts = taskOpts[this.target]; // config.yabs.WORKFLOW
    // grunt.verbose.writeln("resulting options" + JSON.stringify(workflowOpts));

    // The data object is used to pass data to downstream tools
    var data = {
      args: _.toArray(this.args),
      manifestCache: {},
      completedTools: [],
      origVersion: null,
      version: null,
      lastTag: null,
    };
    // This task runs
    var done = grunt.task.current.async();
    // We use promises in order to serialize asnyc operations like ajax requests.
    var q = new Q();

    // Check command line args
    if( process.argv.length < 3 || process.argv[2].split(':')[0] !== 'yabs'||
        process.argv[2].split(':').length !== 3 ) {
      grunt.log.errorlns("argv:", JSON.stringify(process.argv));
      grunt.fail.fatal('Usage: grunt yabs:target:mode');
    }

    var flags = grunt.option.flags();
    for( var i=0; i<flags.length; i++ ) {
      var flag = flags[i].split('=')[0];
      if( !_.includes(KNOWN_ARGS, flag) ) {
        grunt.log.errorlns("flags:", JSON.stringify(grunt.option.flags()));
        grunt.fail.warn('Unsupported command line argument "' + flag +
          '" (' + grunt.log.wordlist(KNOWN_ARGS) + ').');
      }
    }

    // Run the tool chain. We assume that property order *is* predictable in V8!
    for(var toolname in workflowOpts){
      if( toolname === 'common' ) { continue; }
      var tooltype = toolname.match(/^([^_]*)/)[1];
      if( !_.includes(KNOWN_TOOLS, tooltype) ){
        grunt.fail.warn('Tool "' + toolname + '" is not of a known type (' + grunt.log.wordlist(KNOWN_TOOLS) + ').');
      }
      var toolOptions = _.merge(
        {}, // copy, so we don't modify the original
        DEFAULT_OPTIONS.common,                            // Hard coded defaults
        DEFAULT_OPTIONS[tooltype],
        grunt.config([this.name, 'options', 'common']),    // config.yabs.options.common
        grunt.config([this.name, 'options', tooltype]),    // config.yabs.options.TOOLTYPE
        grunt.config([this.name, this.target, 'common']),  // config.yabs.WORKFLOW.common
        grunt.config([this.name, this.target, toolname])); // config.yabs.WORKFLOW.TOOLNAME

      // Make sure that --no-write is always honored
      if( grunt.option('no-write') ) {
        toolOptions.noWrite = true;
      }
      // Make sure we have a current version
      if( !data.origVersion ) {
        var manifest = readJsonCached(data.manifestCache, toolOptions.manifests[0]);
        data.version = data.origVersion = semver.valid(manifest.version);
      }
      // Store current latest tag
      data.currentTagName = getCurrentTagNameCached(toolOptions, data);
      // Queue a runner function that calls a tool and returns a promise
      q = q.then(makeToolRunner(tooltype, toolname, toolOptions, data));
    }
    q.catch(function(msg){
      grunt.fail.warn(msg || 'ERROR: grunt-yabs failed');
    }).finally(function(){
      grunt.log.writeln('Running ' + data.completedTools.length + ' tools took ' +
          (0.001 * (Date.now() - start)).toFixed(2) + ' seconds.');
      if( grunt.option('no-write') ) {
        grunt.log.writeln('* DRY-RUN mode: No bits were harmed during the making of this release. *');
      }
      done(); // resolve the grunt async task mode
    });
  });

  /*****************************************************************************
   * Assert preconditions and fail otherwise.
   */
  tool_handlers.check = function(deferred, opts, data) {
    var flag, latestVersion, result, valid,
        errors = 0;

    if( opts.allowedModes ){
      makeArrayOpt(opts, 'allowedModes');
      var mode = (data.args.length ? data.args[0] : null);
      valid = _.includes(opts.allowedModes, mode);
      grunt.log.write('Check if current mode "' + mode + '" is in allowed list (' +
          grunt.log.wordlist(opts.allowedModes) + '): ');
      if( !valid ) {
        grunt.log.error();
        errors += 1;
      }else{
        grunt.log.ok();
      }
    }

    makeArrayOpt(opts, 'branch');

    if( opts.branch.length ){
      result = exec(opts, 'git rev-parse --abbrev-ref HEAD', { always: true });
      var branch = result.stdout.trim();
      valid = false;
      opts.branch.forEach(function(b){
        if( b === branch ) {
          valid = true;
          return false;
        }
      });
      grunt.log.write('Check if current branch "' + branch + '" is in allowed list (' +
          grunt.log.wordlist(opts.branch) + '): ');
      if( !valid ) {
        grunt.log.error();
        errors += 1;
      }else{
        grunt.log.ok();
      }
    }
    if( typeof opts.clean === 'boolean' ){
      // http://stackoverflow.com/questions/2657935/checking-for-a-dirty-index-or-untracked-files-with-git
      flag = !!opts.clean;
      result = exec(opts, 'git diff-index --quiet HEAD --', {
          checkResultCode: false,
          always: true
        });
      grunt.log.write('Check if repository is ' + (flag ? '' : 'not ') + 'clean: ');
      if( flag === (result.code === 0) ) {
        grunt.log.ok();
      }else{
        grunt.log.error();
        errors += 1;
      }
    }
    if( typeof opts.canPush === 'boolean' ){
      flag = !!opts.canPush;
      result = exec(opts, 'git push --dry-run', {
          checkResultCode: false,
          always: true
        });
      grunt.log.write('Check if "git push" would ' + (flag ? 'succeed' : 'fail') + ': ');
      if( flag === (result.code === 0) ) {
        grunt.log.ok();
      }else{
        grunt.log.error();
        grunt.log.errorlns(result.stdout.trim());
        errors += 1;
      }
    }
    if( opts.cmpVersion != null ){
      // Get new tags from the remote
      // result = exec(opts, 'git fetch --tags', {always: true });
      // // Get the latest tag name
      // result = exec(opts, 'git rev-list --tags --max-count=1', {always: true });
      // result = exec(opts, 'git describe --tags ' + result.stdout.trim(), {always: true });
      // latestVersion = semver.valid(result.stdout.trim());
      latestVersion = getCurrentTagNameCached(opts, data);
      latestVersion = semver.valid(latestVersion);
      // TODO: requires  semver v4.0.0:
//    if( semver.cmp(data.version, opts.cmpVersion, latestVersion) ) {
      grunt.log.write('Check if current version (' + data.version + ') is `' +
          opts.cmpVersion + '` latest tag (' + latestVersion   + '): ');
      if( semver[opts.cmpVersion](data.version, latestVersion) ) {
        grunt.log.ok();
      } else {
        grunt.log.error();
        errors += 1;
      }
    }
    // if( typeof opts.isPrerelease === 'boolean' ){
    // }
    // doesn't work(?):
    // grunt.log.writeln('EC: ' + grunt.task.errorCount);
    if ( errors > 0 ) {
      grunt.fail.warn(errors + ' ' + pluralize(errors, 'check failed./checks failed.'));
    }
    deferred.resolve();
  };

  /*****************************************************************************
   * Replace strings (uses https://github.com/outaTiME/applause).
   */
  tool_handlers.replace = function(deferred, opts, data) {
    var file, i;
    var replace_file_count = 0;
    var match_count = 0;

    grunt.log.writeln('Replace task "' + opts.files + '"...');

    if( !opts.files ) {
      grunt.fail.fatal('Please specify a file pattern (' + opts.files + ').');
    }
    if( opts.setTimestamp ) {
      opts.patterns.push({ match: 'timestamp', replacement: opts.setTimestamp });
    }
    if( opts.setVersion ) {
      opts.patterns.push({ match: 'version', replacement: opts.setVersion });
    }
    for(i=0; i<opts.patterns.length; i++) {
      opts.patterns[i].replacement = processTemplate("" + opts.patterns[i].replacement, data);
    }
    var applause = Applause.create({patterns: opts.patterns});
    var files = grunt.file.expand(opts.files);
    for(i=0; i<files.length; i++) {
      file = files[i];

      var contents = grunt.file.read(file, {encoding: 'utf8'});
      var result = applause.replace(contents);
      if( result.content ) {
        replace_file_count += 1;
        match_count += result.count;
        if( opts.noWrite ) {
          grunt.log.writeln('DRY-RUN: Replace ' + result.count + ' occurrences in ' + file + ':');
        } else {
          grunt.log.write('Replaced ' + result.count + ' occurrences in ' + file + ': ');
          grunt.file.write(file, result.content);
          grunt.log.ok();
        }
        /* jshint -W083 */ // Don't make functions within a loop.
        result.detail.forEach(function(o) {
          grunt.log.writeln('    ' + o.match + ' => "' + o.replacement + '"');
        });
        /* jshint +W083 */
      }
    }
    if( replace_file_count ) {
      grunt.log.ok('Replaced ' + match_count + ' matches in ' + replace_file_count + ' / ' + files.length + ' files.');
    } else {
      grunt.log.warn('No text was replaced in ' + files.length + ' files.');
    }
    deferred.resolve();
  };

  /*****************************************************************************
   * Bump version on one or more manifests
   */
  tool_handlers.bump = function(deferred, opts, data) {
    var MODES = ['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease', 'zero'];
    var mode = opts.inc || (data.args.length ? data.args[0] : null);

    makeArrayOpt(opts, 'syncFields');

    if( !mode ) {
      grunt.fail.fatal('Please specify a mode (' + grunt.log.wordlist(MODES) + ').');
    }else if( ! _.includes(MODES, mode) ) {
      grunt.fail.fatal('Unsupported mode "' + mode + '" (expected ' + grunt.log.wordlist(MODES) + ').');
    }
    if( _.includes(opts.syncFields, 'version') ) {
      grunt.fail.fatal('Use "bump.syncVersions: true" instead of bump.syncFields["version"].');
    }

    // Process all JSON manifests
    var masterManifest = null;
    var isFirst = true;

    opts.manifests.forEach(function(filepath) {
      var manifest = readJsonCached(data.manifestCache, filepath);

      var origVersion = semver.valid(manifest.version);
      if( !origVersion && (isFirst || manifest.version) ) {
        // #4: master manifest must have a valid version, but we accept missing
        // version fields in secondaries
        grunt.fail.fatal('Invalid version "' + manifest.version + '" in ' + filepath);
      }

      if( isFirst ) {
        masterManifest = manifest;
        data.origVersion = masterManifest.version;
      }
      if( origVersion ) {
        // This is ether the master manifest, or a secondary with existing version field:
        // Store master version and sync secondaries
        if( mode !== 'zero' ) {
          if( isFirst || !opts.syncVersion ) {
            manifest.version = semver.inc(origVersion, mode);
          }else{
            manifest.version = masterManifest.version;
          }
        }else if( !isFirst && opts.syncVersion ) {
          // don't bump, but sync in 'zero' mode
          manifest.version = masterManifest.version;
        }
        data.version = masterManifest.version;

        if( isFirst && opts.updateConfig ){
          grunt.log.write('Update config.' + opts.updateConfig + '.version to ' + masterManifest.version + ' ');
          if( grunt.config(opts.updateConfig) ){
            grunt.config(opts.updateConfig + '.version', masterManifest.version);
            grunt.log.ok();
          }else{
            grunt.fail.warn('Cannot update config.' + opts.updateConfig + ' (does not exist)');
          }
          // grunt.log.writeln(JSON.stringify(grunt.config(opts.updateConfig)));
        }
        grunt.log.write('Bump version in ' + filepath + ' from ' +
            origVersion + ' to ' + manifest.version + '... ');
      } else {
        // #4: don't try to bump secondaries if they don't have a version field
        grunt.log.warn('Not bumping secondary manifest with missing version field: ' + filepath);
      }
      if( !isFirst && opts.syncFields.length ){
        opts.syncFields.forEach(function(field){
          if( manifest[field] != null && !_.isEqual(masterManifest[field], manifest[field]) ) {
            grunt.log.writeln('Sync field "' + field + '" in ' + filepath +
                ' from ' + JSON.stringify(manifest[field]) +
                ' to ' + JSON.stringify(masterManifest[field]) + '.');
            manifest[field] = masterManifest[field];
          }
        });
      }
      if( !opts.noWrite ){
        grunt.file.write(filepath, JSON.stringify(manifest, null, opts.space));
        // delete data.manifestCache[filepath]; // out-of-date now
      }
      grunt.log.ok();
      isFirst = false;
    });
    deferred.resolve();
  };

  /*****************************************************************************
   * Call grunt tasks.
   */
  tool_handlers.run = function(deferred, opts, data) {
    var task = opts.tasks.join(' ');

    grunt.log.writeln('Run task "' + task + '": starting...');
    exec(opts, 'grunt ' + task, {silent: opts.silent});
    grunt.log.write('Run task "' + task + '": done.');
    grunt.log.ok();
    deferred.resolve();
  };

  /*****************************************************************************
   * Add and commit files.
   */
  tool_handlers.commit = function(deferred, opts, data) {
    makeArrayOpt(opts, 'add');
    if( opts.add.length ){
      exec(opts, 'git add ' + opts.add.join(' '));
      grunt.log.ok('Added files for commit: ' + grunt.log.wordlist(opts.add));
    }
    var message = processTemplate(opts.message, data);
    var commitArgs = opts.addKnown ? '-am' : '-m';
    exec(opts, 'git commit ' + commitArgs + ' "' + message + '"');
    // exec(opts, 'git commit ' + commitArgs + ' "' + message + '" "' + opts.manifests.join('" "') + '"');
    grunt.log.write('Commit "' + message + '" ');
    grunt.log.ok();
    deferred.resolve();
  };

  /*****************************************************************************
   * Create tag.
   */
  tool_handlers.tag = function(deferred, opts, data) {
    var name = processTemplate(opts.name, data);
    var message = processTemplate(opts.message, data);
    exec(opts, 'git tag "' + name + '" -m "' + message + '"');
    grunt.log.write('Create tag ' + name + ': "' + message + '" ');
    grunt.log.ok();
    data.lastTagName = name;
    deferred.resolve();
  };

  /*****************************************************************************
   * Push commits and tags.
   */
  tool_handlers.push = function(deferred, opts, data) {
    var target = opts.target ? (opts.target + ' ') : '';

    if( opts.tags ) {
      if( opts.useFollowTags ) {
        // Pushing in one command prevents Travis from starting two jobs (requires git 1.8.3+)
        exec(opts, 'git push ' + target + '--follow-tags');
      }else{
        exec(opts, 'git push ' + target + '&& git push ' + target + ' --tags');
      }
    }else{
      exec(opts, 'git push ' + target);
    }
    grunt.log.write('Push ' + opts.target + '(' + (opts.tags ? 'with tags' : 'no tags') + ') ');
    grunt.log.ok();
    deferred.resolve();
  };

  /*****************************************************************************
   * Publish release to npm
   */
  tool_handlers.npmPublish = function(deferred, opts, data) {
    var message = processTemplate(opts.message, data);
    exec(opts, 'npm publish .');
    grunt.log.write('Publish to npm ');
    grunt.log.ok();
    deferred.resolve();
  };

  /*****************************************************************************
   * Create a release on Github
   */
  tool_handlers.githubRelease = function(deferred, opts, data) {
    data.repo = opts.repo; // make this option available for template expansion
    var body = processTemplate(opts.body, data);
    var name = processTemplate(opts.name, data);
    var tagName = opts.tagName ? processTemplate(opts.tagName, data) : data.lastTagName;

    if( !data.version || !tagName ) {
      deferred.reject('Missing version and/or tag (run bump and tag tools before githubRelease)');
      return;
    }
    if( !process.env[opts.auth.usernameVar] || !process.env[opts.auth.passwordVar] ) {
      deferred.reject('Invalid option githubRelease.auth.usernameVar: "' +
        opts.auth.usernameVar + '" or passwordVar "' + opts.auth.passwordVar + '"');
      return;
    }

    var sendArgs = {
      tag_name: tagName,
//    target_commitish: null, //'master',
      name: name,
      body: body,
      draft: !!opts.draft,
      prerelease: !!opts.prerelease,
      };

    if( opts.noWrite ) {
      grunt.log.writeln('DRY-RUN: would create GitHub release on repository ' + opts.repo +
        ': ' + JSON.stringify(sendArgs));
      deferred.resolve();
      return;
    }

    grunt.log.write('Create GitHub release ' + opts.repo + ' ' + tagName + '... ');
    request
      .post('https://api.github.com/repos/' + opts.repo + '/releases')
      .auth(process.env[opts.auth.usernameVar], process.env[opts.auth.passwordVar])
      .set('Accept', 'application/vnd.github.manifold-preview')
      .set('User-Agent', 'grunt-yabs')
      .send(sendArgs)
      .end(function(err, res){
        if( res.status === 201 ) {
          grunt.log.ok();
          deferred.resolve();
        } else {
          grunt.log.error();
          grunt.fail.warn('Error creating GitHub release: ' + res.status + " " + res.text);
          deferred.reject(res.text);
        }
      });
  };

};
