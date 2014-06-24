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
 * Copyright (c) 2014 Martin Wendt
 * Licensed under the MIT license.
 */

'use strict';

var lodash = require('lodash');
var semver = require('semver');
var shell = require('shelljs');


module.exports = function(grunt) {

  var _ = lodash;
  var KNOWN_TOOLS = 'bump check commit exec npmPublish push run tag'.split(' ');
  var tool_handlers = {};

  var DEFAULT_OPTIONS = {
    common: { // options used as default for all tools
      args: grunt.util.toArray(this.args), // Additional args after 'yabs:target:'
      verbose: !!grunt.option('verbose'),
      enable: true,             // 
      noWrite: false,           // true enables dry-run
      manifests: ['package.json'], // First entry is 'master' for synchronizing
    },

    // The following tools are executed in order of appearance:

    // 'check': Assert preconditons and fail otherwise
    check: {
      clean: undefined,         // Repo must/must not contain modifications? 
      branch: ['master'],       // Current branch must be in this list
//      allowDirty: [],
//      isPrerelease: undefined,
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
      silent: false,            // `true`: suppress output
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
      target: '',               // E.g. 'upstream'
      tags: false,              // Also push tags
      useFollowTags: true,      // Use `--folow-tags` instead of `&& push --tags`
    },
    // 'npmPublish': Submit to npm repository
    npmPublish: {
//    tag: null,
      message: 'Released {%= version %}',
    },
  };

  if (!shell.which('git')) {
    grunt.fail.fatal('This script requires git');
    return false;
  }
  /** Convert opts.name to an array if not already. */
  // function asArray(val) {
  //   return val == null ? null : (Array.isArray(val) ? val : [ val ]);
  // }
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

  /***/ 
  function readJsonCached(cache, filepath, reload){
    if( reload || !cache[filepath] ) {
      cache[filepath] = grunt.file.readJSON(filepath);
    }
    return cache[filepath];
  }

  /** Execute shell command. */
  function exec(opts, cmd, extra) {
    extra = extra || {};
    var silent = (extra.silent !== false); // Silent, unless explicitly passed `false`
    if ( opts.noWrite && extra.always !== true) {
      grunt.log.writeln('DRY-RUN: would exec: ' + cmd);
    } else {
      grunt.verbose.writeln('Running: ' + cmd);
      var result = shell.exec(cmd, {silent: silent});
      if (extra.checkResultCode !== false && result.code !== 0) {
        grunt.fail.warn('Error (' + result.code + ') ' + result.output);
      }else{
        return result;
      }
    }
  }

  /** Call tool handler with its aggregated options. */
  function runTool(tooltype, toolname, toolOptions, data) {
    // var opts = getToolOpts(taskOptions, data, tooltype, toolname);
    var dispData = _.cloneDeep(data);

    // dispData.masterManifest = '...';
    if( toolOptions.enable ) {
      grunt.verbose.writeln('Running "' + toolname + 
        '" tool with opts=' + JSON.stringify(toolOptions) + 
        ', data=' + JSON.stringify(dispData) + '...');
      tool_handlers[tooltype](toolOptions, data);
      data.completedTools.push(toolname);
    }else{
      grunt.verbose.writeln('"' + toolname + '" tool is disabled.');
    }
  }

  /*****************************************************************************
   *
   * The yabs multi-task
   */
  grunt.registerMultiTask('yabs', 'Collection of tools for grunt release workflows.', function() {

    var taskOpts = grunt.config(this.name);   // config.yabs
    var workflowOpts = taskOpts[this.target]; // config.yabs.WORKFLOW
    // grunt.verbose.writeln("resulting options" + JSON.stringify(workflowOpts));

    // The data object is used to pass data to downstream tools
    var data = {
      args: grunt.util.toArray(this.args),
      manifestCache: {},
      completedTools: [],
      origVersion: null,
      version: null,
    };
    // Run the tool chain. We assume that property order *is* predictable in V8:
    for(var toolname in workflowOpts){
      if( toolname === 'common' ) { continue; }
      var match = false;
      for(var i=0; i<KNOWN_TOOLS.length; i++){
        var tooltype = KNOWN_TOOLS[i];
        if(toolname === tooltype || toolname.indexOf(tooltype + '_') === 0 ){
          match = true;

          var toolOptions = lodash.merge(
            {}, // copy, so we don't modify the original
            DEFAULT_OPTIONS.common,                           // Hard coded defaults
            DEFAULT_OPTIONS[tooltype], 
            grunt.config([this.name, 'options', 'common']),   // config.yabs.options.common
            grunt.config([this.name, 'options', tooltype]),   // config.yabs.options.TOOLTYPE
            grunt.config([this.name, this.target, 'common']), // config.yabs.WORKFLOW.common
            grunt.config([this.name, this.target, toolname])  // config.yabs.WORKFLOW.TOOLNAME
            );
          
          // Make sure that --no-write is always honored
          if( grunt.option('no-write') ) {
            toolOptions.noWrite = true;
          }

          runTool(tooltype, toolname, toolOptions, data);
          break; // type was found, now proceed with next tool
        }
      }
      if( !match ){
        grunt.fail.warn('Tool "' + toolname + '" is not of a known type (' + KNOWN_TOOLS.join(', ') + ').');
      }
    }
    if( grunt.option('no-write') ) {
      grunt.log.writeln('*** DRY-RUN mode: No bits were harmed during this run. ***');
    }
  });

  /*****************************************************************************
   * Assert preconditions and fail otherwise.
   */
  tool_handlers.check = function(opts, data) {
    var result, valid, 
        errors = 0;

    makeArrayOpt(opts, 'branch');

    if( opts.branch.length ){
      result = exec(opts, 'git rev-parse --abbrev-ref HEAD', { always: true });
      var branch = result.output.trim();
      valid = false;
      opts.branch.forEach(function(b){
        if( b === branch ) {
          valid = true;
          return false;
        }
      });
      if( !valid ) {
        grunt.log.error('Current branch "' + branch + '" not in allowed list: "' + opts.branch.join('", "') + '".');
        errors += 1;
      }else{
        grunt.log.ok('Current branch "' + branch + '" in allowed list: "' + opts.branch.join('", "') + '".');
      }
    }
    if( typeof opts.clean === 'boolean' ){
      // http://stackoverflow.com/questions/2657935/checking-for-a-dirty-index-or-untracked-files-with-git
      var flag = !!opts.clean,
          isClean = exec(opts, 'git diff-index --quiet HEAD --', { 
            checkResultCode: false,
            always: true 
          }).code === 0;
      if( flag !== isClean ) {
        grunt.log.error('Repository has ' + (isClean ? 'no ' : '') + 'staged changes.');
        errors += 1;
      }else{
        grunt.log.ok('Repository is ' + (isClean ? '' : 'not ') + 'clean.');
      }
    }
    // if( typeof opts.isPrerelease === 'boolean' ){
    // }
    // doesn't work(?):
    // grunt.log.writeln('EC: ' + grunt.task.errorCount); 
    if ( errors  > 0 ) {
      grunt.fail.warn(errors + grunt.util.pluralize(errors, ' check failed./checks failed.'))  ;
    }
  };

  /*****************************************************************************
   * Bump version on one or more manifests
   */
  tool_handlers.bump = function(opts, data) {
    var MODES = ['major', 'minor', 'patch', 'premajor', 'preminor', 'prepatch', 'prerelease', 'zero'];
    var mode = opts.inc || (data.args.length ? data.args[0] : null);

    makeArrayOpt(opts, 'syncFields');
 
    if( !mode ) {
      grunt.fail.fatal('Please specify a mode (' + MODES.join(', ') + ').');
    }else if( ! _.contains(MODES, mode) ) {
      grunt.fail.fatal('Unsupported mode "' + mode + '" (expected ' + MODES.join(', ') + ').');
    }
    if( _.contains(opts.syncFields, 'version') ) {
      grunt.fail.fatal('Use "bump.syncVersions: true" instead of bump.syncFields["version"].');
    }

    // Process all JSON manifests
    var masterManifest = null; //opts._data.masterManifest;
    var isFirst = true;

    opts.manifests.forEach(function(filepath) {
      var manifest = readJsonCached(data.manifestCache, filepath);
      var origVersion = semver.valid(manifest.version);
      if( !origVersion ){
        grunt.fail.fatal('Invalid version "' + manifest.version + '" in ' + filepath);
      }

      if(isFirst) {
        masterManifest = manifest;
        data.origVersion = masterManifest.version;
      }
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
        if( grunt.config(opts.updateConfig) ){
          grunt.config(opts.updateConfig + '.version', masterManifest.version);
          grunt.log.ok('Updated config.' + opts.updateConfig + '.version to ' + masterManifest.version);
        }else{
          grunt.fail.warn('Cannot update config.' + opts.updateConfig + ' (does not exist)');
        }
        // grunt.log.writeln(JSON.stringify(grunt.config(opts.updateConfig)));
      }
      if( !isFirst && opts.syncFields.length ){
        opts.syncFields.forEach(function(field){
          if( manifest[field] != null && !lodash.isEqual(masterManifest[field], manifest[field]) ) {
            grunt.log.writeln('Sync field "' + field + '" in ' + filepath + ' from ' + JSON.stringify(manifest[field]) + ' to ' + JSON.stringify(masterManifest[field]) + '.');
            manifest[field] = masterManifest[field];
          }
        });
      }
      grunt.log.write('Bumping version in ' + filepath + ' from ' + origVersion + ' to ' + manifest.version + '...');
      if( !opts.noWrite ){
        grunt.file.write(filepath, JSON.stringify(manifest, null, opts.space));
        // delete data.manifestCache[filepath]; // out-of-date now
      }
      grunt.log.ok();
      isFirst = false;
    });
  };

  /*****************************************************************************
   * Call grunt tasks.
   */
  tool_handlers.run = function(opts, data) {
    var task = opts.tasks.join(' ');
    grunt.log.writeln('Run task "' + task + '"...');
    exec(opts, 'grunt ' + task, {silent: opts.silent});
    grunt.log.ok('Run task "' + task + '".');
  };

  /*****************************************************************************
   * Add and commit files.
   */
  tool_handlers.commit = function(opts, data) {
    var message = processTemplate(opts.message, data);
    makeArrayOpt(opts, 'add');
    if( opts.add.length ){
      exec(opts, 'git add ' + opts.add.join(' '));
      exec(opts, 'git commit -m "' + message + '"');
      grunt.log.ok('Added and commited "' + message + '": ' + opts.add.join(', '));
    }else{
      exec(opts, 'git commit -m "' + message + '" "' + opts.manifests.join('" "') + '"');
      grunt.log.ok('Commited "' + message + '": ' + opts.manifests.join(', '));
    }
  };

  /*****************************************************************************
   * Create tag.
   */
  tool_handlers.tag = function(opts, data) {
    var name = processTemplate(opts.name, data);
    var message = processTemplate(opts.message, data);
    exec(opts, 'git tag "' + name + '" -m "' + message + '"');
    grunt.log.ok('Created tag ' + name + ': "' + message + '"');
  };

  /*****************************************************************************
   * Push commits and tags.
   */
  tool_handlers.push = function(opts, data) {
    if( opts.tags ) {
      if( opts.useFollowTags ) {
        // Pushing in one command prevents Travis from starting two jobs (requires git 1.8.3+)
        exec(opts, 'git push ' + opts.target + ' --follow-tags');
      }else{
        exec(opts, 'git push ' + opts.target + ' && git push ' + opts.target + ' --tags');
      }
    }else{
      exec(opts, 'git push ' + opts.target);
    }
    grunt.log.ok('Pushed ' + opts.target + ' (' + (opts.tags ? 'with tags' : 'no tags') + ').');
  };

  /*****************************************************************************
   * Publish release to npm
   */
  tool_handlers.npmPublish = function(opts, data) {
    var message = processTemplate(opts.message, data);
    exec(opts, 'npm publish .');
    grunt.log.ok('Published to npm.');
  };

};
