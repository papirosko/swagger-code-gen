#!/usr/bin/env node

import {main} from './index.js';
import {Command} from "commander";


const program = new Command();
program
    .name('Swagger client code generator')
    .description('CLI to generate client based on swagger definitions')
    .version('1.0.0')
    .option('--url <URI>', 'The url with swagger definitions')
    .option('--referencedObjectsNullableByDefault', 'Assume that referenced objects can be null (say hello to .net assholes)', false)
    .option('--enableScats', 'Generate scats', false)
    .argument('outputFile', 'File with generated code')
    .parse();

const url = program.opts().url;
const referencedObjectsNullableByDefault = program.opts().referencedObjectsNullableByDefault;
const enableScats = program.opts().enableScats;
const outputFile = program.args[0];


main(url, enableScats, outputFile, {
    referencedObjectsNullableByDefault: referencedObjectsNullableByDefault
}).then(() => {
    // nothing
});
