import {Collection, HashMap} from 'scats';
import {Schema, SchemaFactory, SchemaType} from './schemas.js';
import {Property} from './property.js';
import {OpenApiPaths} from './openapi.js';
import {Method} from './method.js';

export function resolveSchemasTypes(json: any): HashMap<string, SchemaType> {
    const jsonSchemas = json.components.schemas;
    const schemasNames = Collection.from(Object.keys(jsonSchemas));
    return schemasNames.toMap(name => [name, SchemaFactory.resolveSchemaType(jsonSchemas[name])]);
}

export function resolveSchemas(json: any, schemasTypes: HashMap<string, SchemaType>): HashMap<string, Schema> {

    const jsonSchemas = json.components.schemas;
    const schemasNames = Collection.from(Object.keys(jsonSchemas));
    return schemasNames
        .toMap<string, Schema | Property>(name =>
            [name, SchemaFactory.build(name, jsonSchemas[name], schemasTypes)]
        );
}


export function resolvePaths(json: any, schemasTypes: HashMap<string, SchemaType>) {
    const jsonSchemas = json.paths as OpenApiPaths;
    return Collection.from(Object.keys(jsonSchemas)).flatMap(path => {
        const methods = jsonSchemas[path];
        return Collection.from(Object.keys(methods)).map(methodName =>
            new Method(path, methodName, methods[methodName], schemasTypes)
        );
    });
}
