'use strict';
require('../src/frame/js/utils/polyfills');
var sinon = require('sinon');
sinon.behavior = require('sinon/lib/sinon/behavior');
sinon.defaultConfig = {
    injectInto: null,
    properties: ['spy', 'stub', 'mock', 'clock', 'server', 'requests'],
    useFakeTimers: true,
    useFakeServer: true
};
require('./utils/sinon');
