'use strict';

const os = require('os');

/**
 * Cross-platform home directory.
 * Works on Linux, macOS, and Windows.
 */
const HOME = os.homedir();

module.exports = { HOME };
