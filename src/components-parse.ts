import {Collection, HashMap, mutable, Nil, option} from 'scats';
import {GenerationOptions, Schema, SchemaFactory, SchemaObject, SchemaType} from './schemas.js';
import {Property, SCHEMA_PREFIX} from './property.js';
import {OpenApiPaths} from './openapi.js';
import {Method, supportedBodyMimeTypes} from './method.js';

export function resolveSchemasTypes(json: any): HashMap<string, SchemaType> {
    const jsonSchemas = json.components.schemas;
    const schemasNames = Collection.from(Object.keys(jsonSchemas));
    const sharedBodies = option(json?.components?.requestBodies)
        .map(x => Collection.from(Object.keys(x)))
        .getOrElseValue(Nil)
        .toMap(name => {
            const sharedBodyDef = json.components.requestBodies[name];
            const mimeTypes = Collection.from(Object.keys(sharedBodyDef['content']));
            const supportedMimeTypes = mimeTypes.filter(_ => supportedBodyMimeTypes.containsKey(_));
            if (sharedBodyDef['content'][supportedMimeTypes.head]['schema']['$ref']) {
                return [name + '$RequestBody', 'object' as SchemaType];
            } else {
                // in case of anyOf we can't create single interface, extending all variants, because properties
                // may not match. instead we treat this case specially, making referenced objects as single type
                // as union.
                // e.g. in case of
                //             "Users.Payers.Payer": {
                //                 "required": true,
                //                 "content": {
                //                     "application/json": {
                //                         "schema": {
                //                             "anyOf": [
                //                                 {
                //                                     "$ref": "#/components/schemas/Users.Payers.Business"
                //                                 },
                //                                 {
                //                                     "$ref": "#/components/schemas/Users.Payers.Individual"
                //                                 }
                //                             ]
                //                         }
                //                     }
                //                 }
                //             }
                // we will generate type `Users.Payers.Business | Users.Payers.Individual`
                return [name + '$RequestBody', 'property' as SchemaType];
            }
        });
    return schemasNames.toMap(name => [name, SchemaFactory.resolveSchemaType(jsonSchemas[name])])
        .appendedAll(sharedBodies);
}

export function resolveSchemas(json: any,
                               schemasTypes: HashMap<string, SchemaType>,
                               options: GenerationOptions): HashMap<string, Schema> {

    const schemas = Collection.from(Object.keys(json.components.schemas))
        .toMap(schemaName => [schemaName, json.components.schemas[schemaName]])
        .appendedAll(
            option(json?.components?.requestBodies)
                .map(x => Collection.from(Object.keys(x)))
                .getOrElseValue(Nil)
                .filter(rb => option(json.components.requestBodies[rb]['content']).isDefined)
                .toMap(rb => {
                    const sharedBodyDef = json.components.requestBodies[rb];
                    const mimeTypes = Collection.from(Object.keys(sharedBodyDef['content']));
                    const supportedMimeTypes = mimeTypes.filter(_ => supportedBodyMimeTypes.containsKey(_));

                    if (sharedBodyDef['content'][supportedMimeTypes.head]['schema']['$ref']) {
                        return [rb + '$RequestBody', sharedBodyDef['content'][supportedMimeTypes.head]['schema']];
                    } else if (sharedBodyDef['content'][supportedMimeTypes.head]['schema']['anyOf']) {
                        // in case of anyOf
                        return [rb + '$RequestBody', {
                            type: Collection.from(sharedBodyDef['content'][supportedMimeTypes.head]['schema']['anyOf'])
                                .map(x => x['$ref'].toString().substring(SCHEMA_PREFIX.length)).mkString(' | ')
                        }];
                    } else {
                        return [rb + '$RequestBody', {
                            type: 'any'
                        }];
                    }
                })
        );

    const pool: mutable.HashMap<string, Schema> = new mutable.HashMap();

    // 1st pass - all enums and props
    pool.addAll(
        schemas.keySet
            .filter(s => schemasTypes.get(s).contains('enum') || schemasTypes.get(s).contains('property'))
            .toMap<string, Schema | Property>(name =>
                [name, SchemaFactory.build(name, schemas.get(name).getOrElseThrow(() => new Error(`No schema for ${name}`)), schemasTypes, options)]
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
        schemas.keySet
            .filter(s => schemasTypes.get(s).contains('object') &&
                SchemaObject.allSuperClassDefined(schemas.get(s)
                    .getOrElseThrow(() => new Error(`No schema for ${s}`)), schemasTypes, pool.keySet)
            )
            .toMap<string, Schema | Property>(name => {
                    const schema = schemas.get(name).getOrElseThrow(() => new Error(`No schema for ${name}`));
                    return [name, SchemaObject.fromDefinition(
                        name,
                        emptyArrayToObj(schema),
                        schemasTypes,
                        options,
                        pool.toImmutable
                    )];
                }
            )
    );

    let currentSize = pool.size;
    let unprocessed = schemas.keySet
        .filter(s => !pool.containsKey(s) && schemasTypes.get(s).contains('object'));
    while (unprocessed.nonEmpty) {
        pool.addAll(
            unprocessed.filter(s => SchemaObject.allSuperClassDefined(emptyArrayToObj(schemas.get(s).get), schemasTypes, pool.keySet))
                .toMap<string, Schema | Property>(name =>
                    [name, SchemaObject.fromDefinition(name, emptyArrayToObj(schemas.get(name).get), schemasTypes, options, pool.toImmutable)]
                )
        );
        unprocessed = schemas.keySet
            .filter(s => !pool.containsKey(s) && schemasTypes.get(s).contains('object'));
        const newSize = pool.size;
        if (newSize <= currentSize) {
            throw new Error(`No superclass definitions were found for ${unprocessed.mkString(', ')}`);
        }
        currentSize = newSize;
    }

    return pool.toImmutable;
}


export function resolvePaths(json: any, schemasTypes: HashMap<string, SchemaType>, options: GenerationOptions,
                             pool: HashMap<string, Schema>) {
    const jsonSchemas = json.paths as OpenApiPaths;
    return Collection.from(Object.keys(jsonSchemas)).flatMap(path => {
        const methods = jsonSchemas[path];
        return Collection.from(Object.keys(methods)).map(methodName =>
            new Method(path, methodName, methods[methodName], schemasTypes, options, pool)
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
    const res =  new mutable.ArrayBuffer<SchemaObject>();
    res.appendAll(paths.filter(m => option(m.response.inPlace).isDefined)
        .map(m => {
            return SchemaObject.fromDefinition(m.response.responseType, m.response.inPlace!, schemasTypes, options, pool);
        }).appendedAll(
            paths.flatMap(m => m.body)
                .filter(b => option(b.inPlace).isDefined)
                .map(m => {
                    console.log(`Generating inplace body: ${m.inPlaceClassname}`);
                    return SchemaObject.fromDefinition(m.inPlaceClassname, m.inPlace!, schemasTypes, options, pool);
                })
        )
    );

    let pending = res.toCollection.flatMap(s => s.properties).filter(p => p.inPlace.isDefined);
    while (pending.nonEmpty) {
        const pass2 = pending.map(p => {
            return SchemaObject.fromDefinition(p.type, p.inPlace.get, schemasTypes, options, pool);
        });
        res.appendAll(pass2);
        pending = pass2.flatMap(s => s.properties).filter(p => p.inPlace.isDefined);
    }

    return res.reverse;
}
