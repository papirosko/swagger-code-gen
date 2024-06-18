import {Collection} from 'scats';
import {Schema} from './schemas.js';
import * as ejs from 'ejs';
import {Property} from './property.js';
import * as fs from 'fs';
import {Method} from './method.js';
import path, {dirname} from 'path';

import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class Renderer {


    async renderToFile(schemas: Collection<Schema | Property>,
                       methods: Collection<Method>,
                       enableScats: boolean,
                       targetNode: boolean,
                       file: string) {

        const view = await ejs.renderFile(
            path.resolve(__dirname, 'templates/index.ejs'),
            {
                schemas: schemas,
                methods: methods,
                scats: enableScats,
                targetNode: targetNode
            });

        fs.writeFileSync(file, view);
    }


}
