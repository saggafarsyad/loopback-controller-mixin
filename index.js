'use strict'

const {deprecate} = require('util')
const mixin = require('./lib/controller')

module.exports = deprecate(app => {
  app.loopback.modelBuilder.mixins.define('Controller', mixin)
}, 'DEPRECATED: Use mixinSources, see https://github.com/saggafarsyad/loopback-controller-mixin#server-config')