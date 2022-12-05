import {Command} from 'commander';
import log4js from 'log4js';
import fetch from 'node-fetch';
import {Renderer} from './renderer.js';
import {resolvePaths, resolveSchemas} from './components-parse.js';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function main() {

    const { configure, getLogger } = log4js;

    configure(`${__dirname}/../config/log4js.json`);
    const logger = getLogger('Generator');

    const program = new Command();
    program
        .name('Swagger client code generator')
        .description('CLI to generate client based on swagger definitions')
        .version('1.0.0')
        .option('--url <URI>', 'The url with swagger definitions')
        .argument('outputFile', 'File with generated code')
        .parse();

    const url = program.opts().url;
    const outputFile = program.args[0];
    logger.info(`Generating code from ${url}`);

    const renderer = new Renderer();

    fetch(url)
        .then(res => res.json())
        .then(async (json: any) => {
            const schemas = resolveSchemas(json);
            const paths = resolvePaths(json);
            logger.debug(`Downloaded swagger: ${schemas.size} schemas, ${paths.size} paths`);

            await renderer.renderToFile(schemas.values, paths, outputFile);
            logger.debug(`Wrote client to ${outputFile}`);

        });

}
