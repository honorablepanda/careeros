const path = require('path');

/** @type {import('next').NextConfig} */
module.exports = {
  // Next 15: this lives at the top level (NOT under experimental)
  outputFileTracingRoot: path.join(__dirname, '..'),
};
