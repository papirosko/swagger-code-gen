import {Collection} from 'scats';
import {Schema} from './schemas.js';
import * as ejs from 'ejs';
import {Property} from './property.js';
import * as fs from 'fs';
import {Method} from './method.js';
import path, {dirname} from 'path';

import {fileURLToPath} from 'url';

import * as scatsLib from 'scats';

const currentFilename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const currentDirname = typeof __dirname !== 'undefined' ? __dirname : dirname(currentFilename);

export class Renderer {


    async renderToFile(schemas: Collection<Schema | Property>,
                       methods: Collection<Method>,
                       enableScats: boolean,
                       targetNode: boolean,
                       file: string) {

        const view = await ejs.renderFile(
            path.resolve(currentDirname, 'templates/index.ejs'),
            {
                scatsLib: scatsLib,
                schemas: schemas,
                methods: methods,
                scats: enableScats,
                targetNode: targetNode
            });

        fs.writeFileSync(file, view);
    }


}
