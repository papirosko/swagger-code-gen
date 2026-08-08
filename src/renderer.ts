import {Collection} from 'scats';
import {Schema} from './schemas.js';
import * as ejs from 'ejs';
import {Property} from './property.js';
import * as fs from 'fs';
import {Method} from './method.js';
import path, {dirname} from 'path';
import {TargetConfig} from './target-profile.js';

import {fileURLToPath} from 'url';

import * as scatsLib from 'scats';

const currentFilename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const currentDirname = typeof __dirname !== 'undefined' ? __dirname : dirname(currentFilename);

export class Renderer {

    async renderToFile(schemas: Collection<Schema | Property>,
                       methods: Collection<Method>,
                       enableScats: boolean,
                       target: TargetConfig,
                       file: string) {
        const view = await ejs.renderFile(
            path.resolve(currentDirname, 'templates/index.ejs'),
            {
                scatsLib: scatsLib,
                schemas: schemas,
                methods: methods,
                scats: enableScats,
                target: target
            });

        fs.writeFileSync(file, view);
    }


}
