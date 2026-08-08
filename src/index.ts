import log4js from 'log4js';
import fetch, {Headers} from 'node-fetch';
import {Renderer} from './renderer.js';
import {filterUsedSchemas, generateInPlace, resolvePaths, resolveSchemas, resolveSchemasTypes} from './components-parse.js';

import {fileURLToPath} from 'url';
import {dirname} from 'path';
import {GenerationOptions, Schema} from './schemas';
import {Collection, Option} from 'scats';
import https from 'https';
import {Method} from './method';
import {TargetConfig} from './target-profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function main(url: string,
                           enableScats: boolean,
                           targetConfig: TargetConfig,
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
        'Authorization': `Basic ${Buffer.from(`${a.user}:${a.password}`).toString('base64')}`
    }));

    const response = await fetch(url, {
        headers: headers.orUndefined,
        agent: httpsAgent
    });

    const json: any = await response.json();
    const schemasTypes = resolveSchemasTypes(json);
    const allSchemas = resolveSchemas(json, schemasTypes, options);
    const paths: Collection<Method> = resolvePaths(json, schemasTypes, options, allSchemas);
    const schemas = options.onlyUsedSchemas
        ? filterUsedSchemas(paths, allSchemas, options.includeSchemasByMask)
        : allSchemas;
    const inplace = generateInPlace(paths, schemasTypes, options, schemas);
    const inplaceMap = inplace.toMap(s => [s.name, s as Schema]);
    const schemasWithInplace = schemas.appendedAll(inplaceMap);
    logger.debug(`Downloaded swagger: ${schemas.size} schemas, ${paths.size} paths`);

    await renderer.renderToFile(schemasWithInplace.values, paths, enableScats, targetConfig, outputFile);
    logger.debug(`Wrote client to ${outputFile}`);
}
