const {defaultTo, castArray} = require('lodash');
const AggregateError = require('aggregate-error');
const tempy = require('tempy');
const setLegacyToken = require('./lib/set-legacy-token');
const getPkg = require('./lib/get-pkg');
const verifyNpmConfig = require('./lib/verify-config');
const verifyNpmAuth = require('./lib/verify-auth');
const addChannelNpm = require('./lib/add-channel');
const prepareNpm = require('./lib/prepare');
const publishNpm = require('./lib/publish');

let verified;
let prepared;
const npmrc = tempy.file({name: '.npmrc'});

async function verifyConditions(pluginConfig, context) {
    // If the npm publish plugin is used and has `npmPublish`, `tarballDir` or `pkgRoot` configured, validate them now in order to prevent any release if the configuration is wrong
    if (context.options.publish) {
        const publishPlugin =
            castArray(context.options.publish).find(config => config.path && config.path === '@semantic-release/npm') || {};

        pluginConfig.npmPublish = defaultTo(pluginConfig.npmPublish, publishPlugin.npmPublish);
        pluginConfig.tarballDir = defaultTo(pluginConfig.tarballDir, publishPlugin.tarballDir);
        pluginConfig.pkgRoot = defaultTo(pluginConfig.pkgRoot, publishPlugin.pkgRoot);
    }

    const errors = verifyNpmConfig(pluginConfig);

    setLegacyToken(context);

    for (const pkgRoot of pluginConfig.pkgRoot) {
        try {

            const pkg = await getPkg({pkgRoot}, context);

            // Verify the npm authentication only if `npmPublish` is not false and `pkg.private` is not `true`
            if (pluginConfig.npmPublish !== false && pkg.private !== true) {
                await verifyNpmAuth(npmrc, pkg, context);
            }
        } catch (error) {
            errors.push(...error);
        }
    }

    if (errors.length > 0) {
        throw new AggregateError(errors);
    }

    verified = true;
}

async function prepare(pluginConfig, context) {
    const errors = verified ? [] : verifyNpmConfig(pluginConfig);

    setLegacyToken(context);
    for (const pkgRoot of pluginConfig.pkgRoot) {
        try {
            // Reload package.json in case a previous external step updated it
            const pkg = await getPkg({pkgRoot}, context);
            if (!verified && pluginConfig.npmPublish !== false && pkg.private !== true) {
                await verifyNpmAuth(npmrc, pkg, context);
            }
        } catch (error) {
            errors.push(...error);
        }

        if (errors.length > 0) {
            throw new AggregateError(errors);
        }

        await prepareNpm(npmrc, {...pluginConfig, pkgRoot}, context);
    }
    prepared = true;
}

async function publish(pluginConfig, context) {
    let pkg;
    const errors = verified ? [] : verifyNpmConfig(pluginConfig);

    setLegacyToken(context);
    const infos = [];
    for (const pkgRoot of pluginConfig.pkgRoot) {
        try {
            // Reload package.json in case a previous external step updated it
            pkg = await getPkg({pkgRoot}, context);
            if (!verified && pluginConfig.npmPublish !== false && pkg.private !== true) {
                await verifyNpmAuth(npmrc, pkg, context);
            }
        } catch (error) {
            errors.push(...error);
        }

        if (errors.length > 0) {
            throw new AggregateError(errors);
        }

        if (!prepared) {
            await prepareNpm(npmrc, {...pluginConfig, pkgRoot}, context);
        }

        const info = publishNpm(npmrc, {...pluginConfig, pkgRoot}, pkg, context);
        infos.push(info);
    }

    return Promise.all(infos).then(values => ({releases: values}));
}

async function addChannel(pluginConfig, context) {
    let pkg;
    const errors = verified ? [] : verifyNpmConfig(pluginConfig);

    setLegacyToken(context);
    const infos = [];
    for (const pkgRoot of pluginConfig.pkgRoot) {
        try {
            // Reload package.json in case a previous external step updated it
            pkg = await getPkg({pkgRoot}, context);
            if (!verified && pluginConfig.npmPublish !== false && pkg.private !== true) {
                await verifyNpmAuth(npmrc, pkg, context);
            }
        } catch (error) {
            errors.push(...error);
        }


        if (errors.length > 0) {
            throw new AggregateError(errors);
        }

        const info = addChannelNpm(npmrc, pluginConfig, pkg, context);
        infos.push(info);
    }

    return infos;
}

module.exports = {verifyConditions, prepare, publish, addChannel};
