"use strict";

const _ = require('lodash');
const Thinky = require('thinky');
const requireAll = require('require-all');

let loader = {
  thinky: null,
  models: {}
};

/**
 * Sanitize incoming config.
 *
 * @param {object} config
 * @return {object} The sanitized config.
 */
const parseConfig = (config) => {
  return Object.assign(
    {
      debug: false,
      log: console.dir.bind(console),
      ignoreModels: [],
      modelConstructorArgs: [],
      modelInitializeArgs: [],
    },
    config
  )
}

loader.initialize = (rawConfig, thinky) => {
  const config = parseConfig(rawConfig)

  loader.thinky = thinky || new Thinky(config.thinky.rethinkdb);

  // This will return a promise
  return loader.thinky.dbReady().then(() => {
    if (config.debug) {
      config.log("DB Ready");
    }

    if (config.debug) {
      config.log("Loading models from path: " + config.modelsPath);
    }

    // Loads all modules from the models directory specified when the loader
    // is initialized
    let definitions = requireAll({
      dirname: config.modelsPath,
      filter: /(.+)\.(js)$/,
      depth: 1,
      caseSensitive: true
    });

    // Delete ignored models from the object store
    let ignoreModels = config.ignoreModels;

    if (ignoreModels && ignoreModels.length) {
      ignoreModels.map(m => delete definitions[m]);
    }

    // Maps all classes loaded into an object
    definitions = _.mapValues(definitions, (d) => {

      let DefinitionModel = d.default;
      const constructorArgs = [loader].concat(config.modelConstructorArgs || [])
      return new DefinitionModel(...constructorArgs);
    });

    // Loop over each class and create the corresponding model
    _.each(definitions, (definition) => {
      let modelId = definition.tableName || definition.globalId;

      if (config.debug) {
        config.log("Creating model id: " + modelId);
      }

      loader.models[modelId] = loader.thinky.createModel(
        modelId,
        definition.schema,
        definition.options
      );
    });

    // Loop over each class and run the initialize method, usually to set up
    // relationships or hooks
    _.each(definitions, (definition) => {
      let modelId = definition.tableName || definition.globalId;

      if (config.debug) {
        config.log("Initializing model id: " + modelId);
      }

      let model = loader.models[modelId];
      const initializeArgs = [loader, model].concat(config.modelInitializeArgs || [])
      definition.initialize(...initializeArgs);
    });

    return loader;
  });

};

module.exports = loader;
