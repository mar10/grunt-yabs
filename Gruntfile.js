/*
 * grunt-yabs
 * https://github.com/martin/grunt-yabs
 *
 * Copyright (c) 2014 Martin Wendt
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: 
      grunt.file.readJSON("package.json"),

    jshint: {
      all: [
        'Gruntfile.js',
        'tasks/*.js',
        '<%= nodeunit.tests %>'
      ],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    // Before generating any new files, remove any previously-created files.
    clean: {
      tests: ['tmp']
    },

    // Options for the 'yabs' task.
    yabs: {
      options: {
        // common default options for all targets (i.e. workflows)
      },
      // Define a workflow named 'release'.
      // (Run like 'grunt yabs:release:patch')
      release: {
        // Default options for all following tools
        common: {
          manifests: ['package.json', 'testbower.json']
        },
        // The following tools are executed in order of appearance:
        // 'check': Assert preconditons and fail otherwise
        check: {
          clean: undefined,       // Repo must/must not contain modifications? 
          branch: ['master'],     // Current branch must be in this list
        },
        // 'bump': increment manifest.version and synchronize with other JSON files.
        bump: {
          // bump also requires a mode
//        inc: null,              // Used instead of 'yabs:target:INC'
          syncVersion: true,      // Only increment master manifest, then copy to secondaries
//        space: 2,               // Used by JSON.stringify
          updateConfig: 'pkg',    // Make sure pkg.version contains new value
          syncFields: ['description', 'keywords'], 
                                  // Synchronize entries from master to secondaries 
                                  // (if exist in target)
        },
        // 'commit': Commit all manifest files (and optionally others)
        commit: {
          add: 'package.json',    // Also add these files ("." for all)
          message: 'Bumping version to {%= version %}',
        },
        // 'tag': Create a tag
        tag: {
          name: 'v{%= version %}',
          message: 'Version {%= version %}',
        },
        // 'run': Run arbitrary grunt tasks (must also be defined in this Gruntfile)
        run: {
          tasks: ['jshint']
        },
        // 'push': push changes and tags
        push: {
          target: '',             // e.g. 'upstream',
          tags: true,             // Also 'push --tags'
        },
        // Tools may be executed multiple times (simply append '_something')
        bump_develop: {
          inc: 'prepatch',
        }
      }
    },

    // Unit tests.
    nodeunit: {
      tests: ['test/*_test.js']
    }

  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks');

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', ['clean', /*'yabs',*/ 'nodeunit']);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint' /*, 'test'*/]);

  grunt.registerTask('build', [
    'yabs:build',
    ]);
};
