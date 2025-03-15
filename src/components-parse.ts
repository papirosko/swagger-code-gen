import {Collection, HashMap, mutable, option} from 'scats';
import {GenerationOptions, Schema, SchemaFactory, SchemaObject, SchemaType} from './schemas.js';
import {Property} from './property.js';
import {OpenApiPaths} from './openapi.js';
import {Method} from './method.js';

export function resolveSchemasTypes(json: any): HashMap<string, SchemaType> {
    const jsonSchemas = json.components.schemas;
    const schemasNames = Collection.from(Object.keys(jsonSchemas));
    return schemasNames.toMap(name => [name, SchemaFactory.resolveSchemaType(jsonSchemas[name])]);
}

export function resolveSchemas(json: any,
                               schemasTypes: HashMap<string, SchemaType>,
                               options: GenerationOptions): HashMap<string, Schema> {

    const jsonSchemas = json.components.schemas;
    const schemasNames = Collection.from(Object.keys(jsonSchemas));

    const pool: mutable.HashMap<string, Schema> = new mutable.HashMap();

    // 1st pass - all enums and props
    pool.addAll(
        schemasNames
            .filter(s => schemasTypes.get(s).contains('enum') || schemasTypes.get(s).contains('property'))
            .toMap<string, Schema | Property>(name =>
                [name, SchemaFactory.build(name, jsonSchemas[name], schemasTypes, options)]
            )
    );

    /**
     * I saw such definitions:
     * ```
     * "Errors.Unauthorized": {
     *     "allOf": [
     *         {
     *             "$ref": "#/components/schemas/Errors.HttpError"
     *         }
     *     ]
     * },
     * "Errors.HttpError": [],
     * "SuccessEmpty": [],
     * ```
      */
    const emptyArrayToObj = (x: any) => SchemaFactory.isEmptyObjectOrArray(x) ? {} : x;

    // 2nd pass - all objects without parents
    pool.addAll(
        schemasNames
            .filter(s => schemasTypes.get(s).contains('object') &&
                SchemaObject.allSuperClassDefined(jsonSchemas[s], schemasTypes, pool.keySet)
            )
            .toMap<string, Schema | Property>(name =>
                [name, SchemaObject.fromDefinition(name, emptyArrayToObj(jsonSchemas[name]), schemasTypes, options, pool.toImmutable)]
            )
    );

    let currentSize = pool.size;
    let unprocessed = schemasNames
        .filter(s => !pool.containsKey(s) && schemasTypes.get(s).contains('object'));
    while (unprocessed.nonEmpty) {
        pool.addAll(
            unprocessed.filter(s => SchemaObject.allSuperClassDefined(emptyArrayToObj(jsonSchemas[s]), schemasTypes, pool.keySet))
                .toMap<string, Schema | Property>(name =>
                    [name, SchemaObject.fromDefinition(name, emptyArrayToObj(jsonSchemas[name]), schemasTypes, options, pool.toImmutable)]
                )
        );
        unprocessed = schemasNames
            .filter(s => !pool.containsKey(s) && schemasTypes.get(s).contains('object'));
        const newSize = pool.size;
        if (newSize <= currentSize) {
            throw new Error(`No superclass definitions were found for ${unprocessed.mkString(', ')}`);
        }
        currentSize = newSize;
    }

    return pool.toImmutable;
}


export function resolvePaths(json: any, schemasTypes: HashMap<string, SchemaType>, options: GenerationOptions) {
    const jsonSchemas = json.paths as OpenApiPaths;
    return Collection.from(Object.keys(jsonSchemas)).flatMap(path => {
        const methods = jsonSchemas[path];
        return Collection.from(Object.keys(methods)).map(methodName =>
            new Method(path, methodName, methods[methodName], schemasTypes, options)
        );
    }).filter(m => {
        const included = options.includeTags.isEmpty || options.includeTags.intersect(m.tags).nonEmpty;
        const excluded = options.excludeTags.nonEmpty && options.excludeTags.intersect(m.tags).nonEmpty;
        return included && !excluded;
    });
}

export function generateInPlace(paths: Collection<Method>,
                                schemasTypes: HashMap<string, SchemaType>,
                                options: GenerationOptions,
                                pool: HashMap<string, Schema>) {
    return paths.filter(m => option(m.response.inPlace).isDefined).map(m => {
        console.log(`Generating inplace object for ${m.endpointName}: ${m.response.responseType}`);
        return SchemaObject.fromDefinition(m.response.responseType, m.response.inPlace!, schemasTypes, options, pool);
    });
}
