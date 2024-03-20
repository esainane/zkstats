// Hoist ts-plugin-inferno into a format that can be used by Jest

const transformInferno = require('ts-plugin-inferno').default;

/**
 * Remember to increase the version whenever transformer's content is changed. This is to inform Jest to not reuse
 * the previous cache which contains old transformer's content
 */
module.exports = {
    version: 1,
    name: 'hoist-ts-plugin-inferno',
    factory: transformInferno,
};
