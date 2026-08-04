/**
 * index.js
 * ========
 * Zapier Platform CLI app definition. Assembles authentication, triggers,
 * and creates into the shape `zapier-platform-core` expects.
 *
 * To actually publish this to Zapier (steps, once you have a Zapier
 * developer account):
 *   1. npm install -g zapier-platform-cli   (needs npm registry access -
 *      not available in this sandbox, but will work on your machine/CI)
 *   2. cd zapier-app && npm install
 *   3. zapier login
 *   4. zapier register "Oli Tools"          (creates the app on Zapier's side)
 *   5. zapier push                          (uploads this code as a new version)
 *   6. zapier promote <version>             (once tested, promote to production)
 *
 * See NOTES.md in this folder for what's genuinely done vs. what still
 * needs your input (app icon, descriptions, Zapier review submission).
 */

const authentication = require('./authentication');
const { includeApiToken, handleErrors } = require('./middleware');

const newEventTrigger = require('./triggers/new-event');

const oliopsCreateContact = require('./creates/oliops-create-contact');
const oliopsCreateTask = require('./creates/oliops-create-task');
const oliflowTriggerWorkflow = require('./creates/oliflow-trigger-workflow');
const olicommerceCartRecovery = require('./creates/olicommerce-record-cart-recovery');
const olisalestrackRecordSale = require('./creates/olisalestrack-record-sale');
const oliexplorePublishPost = require('./creates/oliexplore-publish-post');
const oliLocatorCreateLead = require('./creates/oli-locator-create-lead');

const packageJson = require('./package.json');

module.exports = {
  version: packageJson.version,
  platformVersion: '15.0.0',

  authentication,

  beforeRequest: [includeApiToken],
  afterResponse: [handleErrors],

  triggers: {
    [newEventTrigger.key]: newEventTrigger
  },

  creates: {
    [oliopsCreateContact.key]: oliopsCreateContact,
    [oliopsCreateTask.key]: oliopsCreateTask,
    [oliflowTriggerWorkflow.key]: oliflowTriggerWorkflow,
    [olicommerceCartRecovery.key]: olicommerceCartRecovery,
    [olisalestrackRecordSale.key]: olisalestrackRecordSale,
    [oliexplorePublishPost.key]: oliexplorePublishPost,
    [oliLocatorCreateLead.key]: oliLocatorCreateLead
  },

  searches: {}
};
