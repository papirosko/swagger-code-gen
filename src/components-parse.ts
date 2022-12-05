import {Collection, HashMap} from 'scats';
import {Schema, SchemaFactory} from './schemas.js';
import {Property} from './property.js';
import {OpenApiPaths} from './openapi.js';
import {Method} from './method.js';

export function resolveSchemas(json: any): HashMap<string, Schema | Property> {
    const jsonSchemas = json.components.schemas;
    return Collection.from(Object.keys(jsonSchemas))
        .toMap<string, Schema | Property>(name =>
            [name, SchemaFactory.build(name, jsonSchemas[name])]
        );
}


export function resolvePaths(json: any) {
    const jsonSchemas = json.paths as OpenApiPaths;
    return Collection.from(Object.keys(jsonSchemas)).flatMap(path => {
        const methods = jsonSchemas[path];
        return Collection.from(Object.keys(methods)).map(methodName =>
            new Method(path, methodName, methods[methodName])
        );
    });
}
