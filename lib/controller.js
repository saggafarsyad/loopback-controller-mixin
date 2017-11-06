/**
 * Loopback Controller Mixin
 *
 * A mixin to separate remote method from Model file and hides pre-defined remote methods
 *
 * @author Saggaf Arsyad
 * @email saggaf.arsyad@gmail.com
 * @since 2017/11/03
 */

'use strict'

// Import
const _ = require('lodash')
const path = require('path')

// Logger
const debug = require('debug')('loopback:mixin:controller')

// Const
const MODEL_METHODS = [
  'count', 'create', 'createChangeStream', 'deleteById', 'exists', 'find',
  'findById', 'findOne', 'patchOrCreate', 'prototype.patchAttributes',
  'replaceById', 'replaceOrCreate', 'updateAll', 'upsertWithWhere'
]
const RELATION_METHODS = [
  'count', 'create', 'delete', 'destroy', 'destroyById', 'findById', 'get',
  'update', 'updateById'
]
const SCOPE_METHODS = [
  'get', 'create', 'delete', 'count'
]
const CONTROLLER_NAME_PREFIX = 'endpoint:'
const CONTROLLER_DEFAULT_DIR = './common/controllers/'

/**
 * Controller mixin
 *
 * @param {Object} Model Loopback Model instance
 * @param {Object} options Mixin options
 * @param {Object} options._meta Contains controller metadata
 * @param {string} options._meta.fileName Controller file name for current model
 * @param {string} options._meta.filePath Controller relative file path to project root
 * @param {Object} options.whitelist Contains pre-defined remote method to be whitelisted
 * @param {string[]} options.whitelist.base List of pre-defined base remote methods
 * @param {string[]} options.whitelist.relations List of pre-defined relation remote methods
 * @param {string[]} options.whitelist.scopes List of pre-defined scope remote methods
 * @param {string[]} options.blacklist List of other remote methods/endpoint that is not pre-defined
 */
function Controller(Model, options) {
  // If Model is exposed to public, apply mixin
  if (Model && Model.sharedClass) {
    // Load controllers
    // -- Load meta
    let meta = options._meta || {}
    // Get controller path
    let fileName = meta.fileName || _.kebabCase(Model.modelName)
    let filePath = meta.filePath || path.resolve(CONTROLLER_DEFAULT_DIR, fileName + '.js')
    // Get controller definitions
    let controllers = []
    require(filePath)(Model, controllers)
    // Prepare controllers
    let keys = Object.keys(controllers)
    controllers = keys.map(name => {
      let controller = controllers[name]
      controller.name = name
      return prepare(controller)
    })
    // Load controllers
    loadController(Model, controllers)
    // Hide remote methods except whitelisted
    hideEndpoints(Model, options.blacklist || [], options.whitelist || {})
  }
}

/**
 * Hide remote method/endpoints
 *
 * @param {Model} model Model instance
 * @param {string[]} blacklist List of blacklisted methods/endpoint that is not pre-defined
 * @param {Object} whitelist Whitelist methods
 * @param {string[]} whitelist.base List of pre-defined base methods
 * @param {string[]} whitelist.relations List of pre-defined relation methods
 * @param {string[]} whitelist.scopes List of pre-defined scope methods
 */
function hideEndpoints(model, blacklist, whitelist) {
  // Init cache
  let len
  // Get base methods
  // -- Get whitelist filter
  let filter = whitelist.base
  // -- If filter is defined, get blacklist base methods and filter whitelisted
  let modelMethods
  if (filter && Array.isArray(filter) && filter.length > 0) {
    modelMethods = MODEL_METHODS.filter(methodName => filter.indexOf(methodName) < 0)
  } else {
    modelMethods = MODEL_METHODS
  }
  // -- Merge blacklist
  blacklist = blacklist.concat(modelMethods)
  // Get relation full method name
  blacklist = blacklist.concat(getSettings(model, 'relations', whitelist.relation || []))
  // Get scopes full method name
  blacklist = blacklist.concat(getSettings(model, 'scopes', whitelist.scopes || []))
  // Hide blacklist methods
  debug('Blacklisted methods: %s', blacklist)
  len = blacklist.length
  for (let i = 0; i < len; i++) {
    model.disableRemoteMethodByName(blacklist[i])
  }
}

/**
 * Get scope or relation in Model definition
 *
 * @param {Model} model Model instance
 * @param {string} (scopes|relations) name Setting name. Values: scopes, relations
 * @param {string[]} whitelist List of exposed pre-defined method
 *
 * @return {string[]} Scopes or Relation to be hidden
 */
function getSettings(model, name, whitelist) {
  // Init keys
  let keys = []
  // Get setting if available
  if (model.definition.settings[name])
    keys = Object.keys(model.definition.settings[name])
  // Merge keys
  if (model[name])
    keys = _.union(keys, Object.keys(model[name]))
  // Get prefix and pre-defined methods
  let prefix, predefinedMethods
  if (name === 'relations') {
    prefix = 'prototype.__'
    predefinedMethods = RELATION_METHODS
  } else if (name === 'scopes') {
    prefix = '__'
    predefinedMethods = SCOPE_METHODS
  } else return []
  // Generate keys
  let blacklist = keys.reduce((blacklist, key) => {
    // If key is whitelisted, continue
    if (whitelist.indexOf(key) >= 0) return blacklist
    // Generate full method name
    let n = predefinedMethods.map(m => prefix + m + '__' + key)
    // Merge
    return blacklist.concat(n)
  }, [])
  // Debug
  debug('Setting name: %s, methods: %s', name, blacklist)
  // Return
  return blacklist
}

/**
 * Prepare for updates
 *
 * @param {object} definition Endpoint definition
 * @param {string} definition.name Endpoint name
 * @param {string} definition.verb HTTP Verb
 * @param {string} definition.path Routing path relative to model
 * @param {string} definition.description Description
 * @param {(Object[] | Object)} definition.accepts Accepted parameters/query
 * @param {(Object[] | Object)} definition.returns Returned result
 * @param {boolean} definition.isStatic Static or prototype method
 * @param {Object} definition.options Remote method options. See Loopback Remote Method definitions
 * @param {Function)} definition.handler Main endpoint handler
 * @param {Function} definition.before beforeRemote hook
 * @param {Function} definition.after afterRemote hook
 * @param {Function} definition.error afterRemoteError hook
 */
function prepare(definition) {
  // Init options for remote method
  let remoteMethod = definition.options || {}
  // -- If isStatic is unset, set to true
  if (definition.isStatic === undefined || definition.isStatic === null)
    definition.isStatic = true
  // -- Set name
  let name = getEndpointName(definition.name)
  // ---- If isStatic, add prototype prefix
  if (!definition.isStatic)
    name = 'prototype.' + name
  // -- Map http
  // ---- If http is not defined, init http
  if (!remoteMethod.http)
    remoteMethod.http = {}
  // ---- Add verb and path
  remoteMethod.http.verb = definition.verb.toLowerCase() || 'get'
  remoteMethod.http.path = definition.path
  // -- Map description
  if (definition.description)
    remoteMethod.description = definition.description
  // -- Map accepts and returns
  remoteMethod.accepts = definition.accepts || []
  remoteMethod.returns = definition.returns || {root: true, type: 'object'}
  // -- Map acls
  // ---- Convert acl to array
  if (definition.acls && typeof definition.acls === 'object')
    definition.acls = [definition.acls]
  else if (!definition.acls)
  definition.acls = []
  // --- Set default acl value
  let acls = definition.acls.map(acl => {
    // Set default acl.property to endpoint name
    if (!acl.property)
      acl.property = name
    // Set default acl.principalType to ROLE
    if (!acl.principalType)
      acl.principalType = 'ROLE'
    // Return acl
    return acl
  })
  // -- Map handlers
  // ---- If handler is unset, throw error
  if (!definition.handler) throw new Error('Handler is not set')
  let hooks = []
  if (definition.before) hooks.push({type: 'beforeRemote', handler: definition.before})
  if (definition.after) hooks.push({type: 'afterRemote', handler: definition.after})
  if (definition.error) hooks.push({type: 'afterRemoteError', handler: definition.error})
  // Return controller definition
  return {
    name: name,
    isStatic: definition.isStatic,
    remoteMethod: remoteMethod,
    acls: acls,
    handler: definition.handler,
    hooks: hooks
  }
}

/**
 * Load controllers to Model
 *
 * @param {Object} model Loopback model instance
 * @param {Object[]} controllers List of controllers definition
 */
function loadController(model, controllers) {
  let len = controllers.length
  for (let i = 0; i < len; i++) {
    // Get definition
    let def = controllers[i]
    let name = def.name
    // -- Define remote method
    model.remoteMethod(name, def.remoteMethod)
    if (def.isStatic)
      model[name] = def.handler
    else
      model.prototype[name] = def.handler
    // -- Define acls
    if (def.acls && def.acls.length > 0) {
      // Init acls if unset
      if (!model.settings.acls) model.settings.acls = []
      // Merge ACL
      model.settings.acls = model.settings.acls.concat(def.acls)
    }
    // -- Define hooks
    let hooksLen = def.hooks.length
    if (hooksLen > 0) {
      for (let j = 0; j < hooksLen; j++) {
        // Get handler
        let hook = def.hooks[j]
        // Register hook
        model[hook.type](name, hook.handler)
      }
    }
  }
}

/**
 * Get full endpoint name with prefix
 *
 * @param {string} name Endpoint name
 * @return {string} Full endpoint name with prefix `endpoint:`
 */
function getEndpointName(name) {
  return CONTROLLER_NAME_PREFIX + name
}

module.exports = Controller
