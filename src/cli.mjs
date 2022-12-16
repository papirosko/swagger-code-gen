#!/usr/bin/env node

import {main} from './index.js';
import {Command} from "commander";
import {HashSet} from "scats";


const program = new Command();
program
    .name('Swagger client code generator')
    .description('CLI to generate client based on swagger definitions')
    .version('1.0.0')
    .requiredOption('--url <URI>', 'The url with swagger definitions')
    .option('--referencedObjectsNullableByDefault', 'Assume that referenced objects can be null (say hello to .net assholes)', false)
    .option('--includeTags <tags...>', 'Space-separated list of tags of paths to be included. Path is included if it contains any of specified tag')
    .option('--excludeTags <tags...>', 'Space-separated list of tags of paths to be excluded. Path is excluded if it contains any of specified tag')
    .option('--enableScats', 'Generate scats', false)
    .argument('outputFile', 'File with generated code')
    .parse();

const url = program.opts().url;
const referencedObjectsNullableByDefault = program.opts().referencedObjectsNullableByDefault;
const enableScats = program.opts().enableScats;
const outputFile = program.args[0];
const includeTags = HashSet.from(program.opts().includeTags || []);
const excludeTags = HashSet.from(program.opts().excludeTags || []);

main(url, enableScats, outputFile, {
    referencedObjectsNullableByDefault: referencedObjectsNullableByDefault,
    includeTags: includeTags,
    excludeTags: excludeTags
}).then(() => {
    // nothing
});
