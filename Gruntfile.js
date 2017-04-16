/*
 * grunt-yabs
 * https://github.com/martin/grunt-yabs
 *
 * Copyright (c) 2014-2017 Martin Wendt
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
      // options: {
      //   common: { // defaults for all tools
      //     manifests: ['package.json', 'testbower.json'],
      //   },
      // },
      // test1: {
      //   run: { tasks: ['jshint'] },
      //   //check: { branch: ['master'], canPush: true, clean: true, cmpVersion: 'gte' },
      //   replace: { files: ['./test/*.txt'] },
      // },
      release: {
        common: { // defaults for all tools
        },
        run: { tasks: ['jshint'] },
        check: { branch: ['master'], canPush: true, clean: true, cmpVersion: 'gte' },
        bump: {},
        commit: {},
        tag: {},
        push: { tags: true, useFollowTags: true },
        githubRelease: {
          repo: "mar10/grunt-yabs",
          draft: false,
          prerelease: false,
        },
        npmPublish: {},
        bump_develop: { inc: 'prepatch' },
        commit_develop: { message: 'Bump for prerelease ({%= version %}) [ci skip]' },
        push_develop: {},
      },
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
