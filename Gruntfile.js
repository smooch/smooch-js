'use strict';

/* global process:false */

module.exports = function(grunt) {
    require('matchdep').filterDev('grunt-*').forEach(grunt.loadNpmTasks);
    grunt.registerTask('awsconfig', function() {
        var awsConfig;
        try {
            awsConfig = grunt.file.readJSON('grunt-aws.json');
        }
        catch (e) {
            awsConfig = {};
        }

        awsConfig.key = (process.env.AWS_ACCESS_KEY_ID || awsConfig.key);
        awsConfig.secret = (process.env.AWS_SECRET_ACCESS_KEY || awsConfig.secret);
        awsConfig.bucket = (process.env.SK_JS_S3_BUCKET || awsConfig.bucket);
        awsConfig.region = (process.env.SK_JS_S3_REGION || awsConfig.region);

        grunt.config.set('aws', awsConfig);
    });

    // Project configuration
    grunt.initConfig({
        // Metadata
        pkg: grunt.file.readJSON('package.json'),
        license: grunt.file.read('LICENSE'),
        globalVersion: '<%= pkg.version %>',
        clean: ['dist/*'],

        s3: {
            options: {
                key: '<%= aws.key %>',
                secret: '<%= aws.secret %>',
                bucket: '<%= aws.bucket %>',
                access: 'public-read',
                headers: {
                    'Cache-Control': 'max-age=630720000, public'
                }
            },
            upload: [{
                src: 'dist/*',
                dest: '/'
            }]
        },

        concurrent: {
            dev: ['exec:hotDevServer', 'exec:devServer'],
            options: {
                logConcurrentOutput: true
            }
        },

        release: {
            options: {
                npm: true,
                bump: false,
                commit: true,
                push: false,
                remote: 'git@github.com:smooch/smooch-js.git',
                github: {
                    repo: 'smooch/smooch-js',
                    accessTokenVar: 'GITHUB_ACCESS_TOKEN',
                    releaseNotes: 'release_notes'
                }
            }
        },

        exec: {
            createRelease: {
                cmd: function() {
                    return [
                        'git checkout -b r/' + this.option('globalVersion'),
                        'npm run sentry-cli -- releases new ' + this.option('globalVersion')
                    ].join(' && ');
                }
            },
            setReleaseCommits: {
                cmd: function () {
                    return 'npm run sentry-cli -- releases set-commits ' + this.option('globalVersion') + ' --auto';
                }
            },
            uploadSourceMap: {
                cmd: function () {
                    return 'npm run sentry-cli -- releases files ' + this.option('globalVersion') + ' upload-sourcemaps ./dist/';
                }
            },
            finalizeRelease: {
                cmd: function() {
                    return 'npm run sentry-cli -- releases finalize ' + this.option('globalVersion');
                }
            },
            cleanRelease: {
                cmd: function() {
                    return [
                        'git checkout master',
                        'git branch -D r/' + this.option('globalVersion'),
                        'git tag -d ' + this.option('globalVersion')
                    ].join(' && ');
                }
            },
            commitFiles: {
                cmd: function() {
                    return 'git commit -am "Release v' + this.option('globalVersion') + ' [ci skip]"';
                }
            },
            push: {
                cmd: function() {
                    return [
                        'git push origin master',
                        'git checkout integration',
                        'git merge master --no-ff',
                        'git push origin integration'
                    ].join(' && ');
                }
            },
            addDist: {
                cmd: 'git add --force dist/'
            },
            addLib: {
                cmd: 'git add --force lib/'
            },
            clean: {
                cmd: 'rm -rf dist/'
            },
            build: {
                cmd: 'npm run build'
            },
            buildNpm: {
                cmd: 'npm run build:npm'
            }
        },

        gitinfo: {
            commands: {
                'status.porcelain': ['status', '--porcelain']
            }
        }
    });

    grunt.registerTask('checkBranchStatus', 'A task that ensures the correct branch is checked out and there are no working changes.', function() {
        var gitInfo = grunt.config.get('gitinfo');

        if (gitInfo.status.porcelain || gitInfo.local.branch.current.name !== 'master') {
            grunt.log.error('Error. Please make sure you have master checked out and there are no working changes.');
            grunt.log.error('Git Status:', '\n' + gitInfo.status.porcelain);
            grunt.log.error('Git Branch: ', '\n ' + gitInfo.local.branch.current.name);
            return false;
        }

        if (!process.env.GITHUB_ACCESS_TOKEN) {
            grunt.log.error('Please set your github access token as env variables (GITHUB_ACCESS_TOKEN)');
            return false;
        }
    });

    grunt.registerTask('versionBump', function() {
        var semver = require('semver');
        var VERSION_REGEXP = /(\bversion[\'\"]?\s*[:=]\s*[\'\"])([\da-z\.-]+)([\'\"])/i;
        var files = ['package.json', 'bower.json', 'src/js/constants/version.js'];
        var fullVersion = grunt.option('version');
        var versionType = grunt.option('versionType');
        var globalVersion;

        // unless the version or increment is explicitly set, let's try
        // to figure out what is the next version
        if (!fullVersion && !versionType) {
            const currentVersion = require('./package.json').version;
            const nextPatchVersion = semver.inc(currentVersion, 'patch');
            const nextMinorVersion = semver.inc(currentVersion, 'minor');
            const nextMajorVersion = semver.inc(currentVersion, 'major');

            fullVersion = [nextPatchVersion, nextMinorVersion, nextMajorVersion].find((version) => {
                try {
                    grunt.file.read('release_notes/v' + version + '.md');
                    return true;
                }
                catch (err) {
                    return false;
                }
            });
        }

        files.forEach(function(file) {
            var version = null;
            var content = grunt.file.read(file).replace(VERSION_REGEXP, function(match, prefix, parsedVersion, suffix) {
                version = fullVersion || semver.inc(parsedVersion, versionType);
                return prefix + version + suffix;
            });

            if (!globalVersion) {
                globalVersion = version;
            } else if (globalVersion !== version) {
                grunt.warn('Bumping multiple files with different versions!');
            }

            grunt.file.write(file, content);
            grunt.log.ok('Version bumped to ' + version + (files.length > 1 ? ' (in ' + file + ')' : ''));
        });

        grunt.option('globalVersion', globalVersion);
        grunt.config.set('globalVersion', globalVersion);

        try {
            grunt.file.read('release_notes/v' + globalVersion + '.md');
        }
        catch (err) {
            grunt.log.error('Release notes not found.');
            grunt.log.error('Please ensure release notes exist in the release_notes folder. (v' + globalVersion + '.md)');
            return false;
        }
    });

    grunt.registerTask('publish', 'Publishes a build to github and NPM, accepting a version as argument', function(version) {
        if (!version || ['major', 'minor', 'patch'].indexOf(version) > -1) {
            grunt.option('versionType', version);
        } else {
            grunt.option('version', version);
        }

        grunt.task.run('branchCheck', 'publish:prepare', 'publish:release', 'publish:cleanup');
    });

    grunt.registerTask('build', ['clean', 'exec:build', 'exec:buildNpm']);

    grunt.registerTask('deploy', ['build', 'awsconfig', 's3']);

    grunt.registerTask('publish:prepare', ['versionBump', 'exec:commitFiles', 'exec:createRelease', 'build', 'exec:addDist', 'exec:addLib']);
    grunt.registerTask('publish:release', ['release', 'exec:setReleaseCommits', 'exec:uploadSourceMap', 'exec:finalizeRelease']);
    grunt.registerTask('publish:cleanup', ['exec:cleanRelease', 'exec:push']);

    grunt.registerTask('branchCheck', 'Checks that you are publishing from Master branch with no working changes', ['gitinfo', 'checkBranchStatus']);
};
