#!/usr/bin/env node

import {main} from './index.js';
import {Command} from "commander";
import {HashSet, option} from "scats";
import {TargetProfileResolver} from './target-profile.js';


const program = new Command();
program
    .name('Swagger client code generator')
    .description('CLI to generate client based on swagger definitions')
    .version('1.0.0')
    .requiredOption('--url <URI>', 'The url with swagger definitions')
    .option('--referencedObjectsNullableByDefault', 'Assume that referenced objects can be null (say hello to .net assholes)', false)
    .option('--includeTags <tags...>', 'Space-separated list of tags of paths to be included. Path is included if it contains any of specified tag')
    .option('--excludeTags <tags...>', 'Space-separated list of tags of paths to be excluded. Path is excluded if it contains any of specified tag')
    .option('--onlyUsedSchemas', 'Generate only schemas reachable from filtered methods', false)
    .option('--includeSchemasByMask <masks...>', 'Space-separated list of schema name masks to force-include with dependencies (supports * and ? wildcards)')
    .option('--enableScats', 'Generate scats', false)
    .option('--target <profile>', 'Generated client runtime profile: browser, node18, node-fetch3')
    .option('--multipart-impl <implementation>', 'Implementation for multipart/form-data request bodies: global, form-data')
    .option('--binary-response <type>', 'Return type for binary response bodies: arraybuffer, buffer')
    .option('--user <username>', 'If swagger requires authorisation')
    .option('--password <password>', 'If swagger requires authorisation')
    .option('--ignoreSSLErrors', 'If swagger requires authorisation, but ssl cert is wrong')
    .argument('outputFile', 'File with generated code')
    .parse();

const url = program.opts().url;
const user = program.opts().user;
const password = program.opts().password;
const ignoreSSLErrors = program.opts().ignoreSSLErrors;
const referencedObjectsNullableByDefault = program.opts().referencedObjectsNullableByDefault;
const enableScats = program.opts().enableScats;
const target = program.opts().target;
const multipartImplementation = program.opts().multipartImpl;
const binaryResponse = program.opts().binaryResponse;
const outputFile = program.args[0];
const includeTags = HashSet.from(program.opts().includeTags || []);
const excludeTags = HashSet.from(program.opts().excludeTags || []);
const onlyUsedSchemas = program.opts().onlyUsedSchemas;
const includeSchemasByMask = HashSet.from(program.opts().includeSchemasByMask || []);

function errorMessage(error) {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }

    const details = [];
    if (error instanceof Error) {
        details.push(error.name);
    }
    if (error && typeof error === 'object') {
        const typedError = error;
        if (typedError.type) details.push(`type=${typedError.type}`);
        if (typedError.code) details.push(`code=${typedError.code}`);
        if (typedError.cause instanceof Error && typedError.cause.message.trim().length > 0) {
            details.push(`cause=${typedError.cause.message}`);
        } else if (typedError.cause) {
            details.push(`cause=${String(typedError.cause)}`);
        }
    }
    return details.length > 0 ? details.join(', ') : String(error);
}

try {
    const targetConfig = TargetProfileResolver.resolve(TargetProfileResolver.optionsFromStrings(
        target,
        multipartImplementation,
        binaryResponse
    ));
    await main(url, enableScats, targetConfig, outputFile,
        ignoreSSLErrors,
        option(user).flatMap(u => option(password).map(p => ({
            user: u,
            password: p
        }))),
        {
            referencedObjectsNullableByDefault: referencedObjectsNullableByDefault,
            includeTags: includeTags,
            excludeTags: excludeTags,
            onlyUsedSchemas: onlyUsedSchemas,
            includeSchemasByMask: includeSchemasByMask
        });
} catch (error) {
    console.error(`Failed to generate client: ${errorMessage(error)}`);
    process.exitCode = 1;
}
