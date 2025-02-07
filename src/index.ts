import log4js from 'log4js';
import fetch from 'node-fetch';
import {Renderer} from './renderer.js';
import {resolvePaths, resolveSchemas, resolveSchemasTypes} from './components-parse.js';

import {fileURLToPath} from 'url';
import {dirname} from 'path';
import {GenerationOptions} from './schemas';
import {Option} from 'scats';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function main(url: string,
                           enableScats: boolean,
                           targetNode: boolean,
                           outputFile: string,
                           ignoreSSLErrors: boolean,
                           auth: Option<{ user: string; password: string }>,
                           options: GenerationOptions) {

    const {configure, getLogger} = log4js;

    configure(`${__dirname}/../config/log4js.json`);
    const logger = getLogger('Generator');

    logger.info(`Generating code from ${url}`);

    const httpsAgent = ignoreSSLErrors ? new https.Agent({
        rejectUnauthorized: false,
    }) : undefined;

    const renderer = new Renderer();
    const headers = auth.map(a => new Headers({
        'Authorization': `Basic ${btoa(a.user + ':' + a.password)}`
    }));

    fetch(url, {
        headers: headers.orUndefined,
        agent: httpsAgent
    })
        .then(res => res.json())
        .then(async (json: any) => {
            const schemasTypes = resolveSchemasTypes(json);
            const schemas = resolveSchemas(json, schemasTypes, options);
            const paths = resolvePaths(json, schemasTypes, options);
            logger.debug(`Downloaded swagger: ${schemas.size} schemas, ${paths.size} paths`);

            await renderer.renderToFile(schemas.values, paths, enableScats, targetNode, outputFile);
            logger.debug(`Wrote client to ${outputFile}`);

        });

}
