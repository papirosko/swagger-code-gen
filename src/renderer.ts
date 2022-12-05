import {Collection} from 'scats';
import {Schema} from './schemas.js';
import * as ejs from 'ejs';
import {Property} from './property.js';
import * as fs from 'fs';
import {Method} from './method.js';

export class Renderer {


    async renderToFile(schemas: Collection<Schema | Property>,
                       methods: Collection<Method>,
                       file: string) {

        const view = await ejs.renderFile(`${__dirname}/templates/index.ejs`, {
            schemas: schemas,
            methods: methods,
        });

        fs.writeFileSync(file, view);
    }

    async renderSchema(obj: Collection<Schema>) {
        return await ejs.renderFile(`${__dirname}/templates/index.ejs`, {
            schemas: obj
        });
    }

    async renderMethod(obj: Collection<Method>) {
        return (await obj.mapPromise(m => ejs.renderFile(`${__dirname}/templates/method.ejs`, {
            method: m
        }))).mkString('\n');
    }

}
