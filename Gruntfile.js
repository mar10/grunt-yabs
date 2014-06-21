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
          manifests: ['package.json', 'testbower.json'],
          noWrite: true,
        },
        // The following tools are executed in order of appearance:
        check: {
          clean: undefined,
          branch: ['master'],
        },
        bump: {
          syncVersion: true,
          updateConfig: 'pkg',
          syncFields: ['description', 'keywords'], 
        },
        commit: {
          add: 'package.json',
          message: 'Bumping version to {%= version %}',
        },
        tag: {
          name: 'v{%= version %}',
          message: 'Version {%= version %}',
        },
        run: {
          tasks: ['jshint', 'jshint']
        },
        push: {
          target: '',
          tags: true,
        },
        npmPublish: {
          message: 'Released {%= version %}',
        },
        // Tools may be executed multiple times (simply append '_something')
        bump_develop: {
          inc: 'prepatch',
        }
      },
      make_patch: {
        common: { // defaults for all tools
          manifests: ['package.json', 'testbower.json'],
          noWrite: true,
        },
        check: { clean: true, branch: ['master'] },
        bump: {},
        commit: {},
        tag: {},
        run: {tasks: ['jshint'] },
        push: {},
        bump_develop: { inc: 'prepatch' }
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
