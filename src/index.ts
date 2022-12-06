import log4js from 'log4js';
import fetch from 'node-fetch';
import {Renderer} from './renderer.js';
import {resolvePaths, resolveSchemas, resolveSchemasTypes} from './components-parse.js';

import {fileURLToPath} from 'url';
import {dirname} from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function main(url: string, enableScats: boolean, outputFile: string) {

    const { configure, getLogger } = log4js;

    configure(`${__dirname}/../config/log4js.json`);
    const logger = getLogger('Generator');

    logger.info(`Generating code from ${url}`);

    const renderer = new Renderer();

    fetch(url)
        .then(res => res.json())
        .then(async (json: any) => {
            const schemasTypes = resolveSchemasTypes(json);
            const schemas = resolveSchemas(json, schemasTypes);
            const paths = resolvePaths(json, schemasTypes);
            logger.debug(`Downloaded swagger: ${schemas.size} schemas, ${paths.size} paths`);

            await renderer.renderToFile(schemas.values, paths, enableScats, outputFile);
            logger.debug(`Wrote client to ${outputFile}`);

        });

}
