#!/usr/bin/env node

import {main} from './index.js';
import {Command} from "commander";
import {HashSet, option} from "scats";


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
    .option('--enableScats', 'Generate scats', false)
    .option('--targetNode', 'Add imports for node-fetch into generated code', false)
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
const targetNode = program.opts().targetNode;
const outputFile = program.args[0];
const includeTags = HashSet.from(program.opts().includeTags || []);
const excludeTags = HashSet.from(program.opts().excludeTags || []);
const onlyUsedSchemas = program.opts().onlyUsedSchemas;

main(url, enableScats, targetNode, outputFile,
    ignoreSSLErrors,
    option(user).flatMap(u => option(password).map(p => ({
        user: u,
        password: p
    }))),
    {
    referencedObjectsNullableByDefault: referencedObjectsNullableByDefault,
    includeTags: includeTags,
    excludeTags: excludeTags,
    onlyUsedSchemas: onlyUsedSchemas
}).then(() => {
    // nothing
});
