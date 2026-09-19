require('./adapters');

const {
  register,
  getProtocol,
  listProtocols,
  inferFromRegistry,
  defaultEndpointsFor,
} = require('./registry');

module.exports = {
  register,
  getProtocol,
  listProtocols,
  inferFromRegistry,
  defaultEndpointsFor,
};
