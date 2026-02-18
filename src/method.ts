import {OpenApiMethod, OpenApiProperty, OpenApiSchema} from './openapi.js';
import {Collection, HashMap, HashSet, identity, Nil, Option, option} from 'scats';
import {Property, SCHEMA_PREFIX} from './property.js';
import {Parameter} from './parameter.js';
import {GenerationOptions, Schema, SchemaFactory, SchemaType} from './schemas.js';
import {NameUtils} from './name.utils.js';


export const SHARED_BODIES_PREFIX = '#/components/requestBodies/';


export interface ResponseDetails {
    /**
     * Used only to render correctly scats methods
     */
    asProperty: Property;
    inPlace?: OpenApiSchema;
    responseType: string;
    description?: string;
    mimeType: string;
    parseMode: 'json' | 'text';
}


const sortByIn = HashMap.of(
    ['path', 0],
    ['query', 1],
    ['header', 2],
    ['cookie', 3],
    ['body', 4],
);


export interface RequestBody {
    body: Schema;
    mimeType: string;
    suffix: string;
    inPlace?: OpenApiSchema;
    inPlaceClassname?: string;
}


export const supportedBodyMimeTypes: HashMap<string, string> = HashMap.of(
    ['application/json', 'Json'],
    ['application/x-www-form-urlencoded', 'Form'],
    ['multipart/form-data', 'File'],
    ['application/octet-stream', 'Binary'],
);

export class Method {

    readonly tags: HashSet<string>;
    readonly summary?: string;
    readonly description?: string;
    readonly response: ResponseDetails;
    readonly parameters: Collection<Parameter>;
    readonly body: Collection<RequestBody>;
    readonly bodyDescription: Option<string>;

    private readonly operationId: Option<string>;
    readonly wrapParamsInObject: boolean;

    private static parseModeByMimeType(mimeType: string): 'json' | 'text' {
        if (mimeType.startsWith('text/') || mimeType.includes('xml')) {
            return 'text';
        }
        return 'json';
    }

    constructor(readonly path: string,
                readonly method: string,
                def: OpenApiMethod,
                schemasTypes: HashMap<string, SchemaType>,
                options: GenerationOptions,
                pool: HashMap<string, Schema>) {
        this.tags = HashSet.from(option(def.tags).getOrElseValue([]));
        this.summary = def.summary;
        this.description = def.description;
        this.operationId = option(def.operationId);

        const parameters = Collection.from(option(def.parameters).getOrElseValue([]))
            .map(p => Parameter.fromDefinition(p, schemasTypes, options))
            .sort((a, b) => {
                const r1 = a.required ? 1 : 0;
                const r2 = b.required ? 1 : 0;
                const reqS = r2 - r1;
                if (reqS === 0) {
                    return sortByIn.get(a.in).getOrElseValue(10) - sortByIn.get(b.in).getOrElseValue(10);
                } else {
                    return reqS;
                }
            });
        const namesCount = parameters.groupBy(p => p.name);
        this.parameters = parameters.map(p => {
            if (namesCount.get(p.name).exists(c => c.size > 1)) {
                return p.copy({
                    uniqueName: `${p.in}${Method.capitalize(p.name)}`
                });
            } else {
                return p;
            }
        });

        this.body = option(def.requestBody)
            .flatMap(body =>
                option(body.content)
                    .orElse(() => {
                        // reference to shared body
                        return option(body).filter(x => {
                            const sharedRef = option(x['$ref']).exists(ref => ref.toString().startsWith(SHARED_BODIES_PREFIX));
                            return sharedRef;
                        })
                            .map(x => {
                                const referenced = pool.get(x['$ref'].substring(SHARED_BODIES_PREFIX.length) + '$RequestBody');
                                if (referenced.exists(o => o instanceof Property)) {
                                    return {
                                        'application/json': {
                                            'schema': {
                                                type: (referenced.get as Property).type
                                            } as unknown as OpenApiSchema,
                                        }
                                    };

                                } else {
                                    return {
                                        'application/json': {
                                            'schema': {
                                                $ref: x['$ref'] + '$RequestBody'
                                            } as unknown as OpenApiSchema,
                                        }
                                    };
                                }
                            });
                    })
            )
            .map(body => {
                const bodyRequired = option(def.requestBody.required).contains(true);
                const mimeTypes = Collection.from(Object.keys(body));
                const supportedMimeTypes = mimeTypes.filter(_ => supportedBodyMimeTypes.containsKey(_));
                return supportedMimeTypes.map(mt => {
                    const bodySchemaDef = body[mt].schema;
                    let res: Schema;
                    let inPlaceClassname = null;
                    if (SchemaFactory.isEmptyObjectOrArray(bodySchemaDef)) {
                        res = Property.fromDefinition('', 'body', {
                            ...bodySchemaDef as OpenApiProperty,
                            required: bodyRequired,
                            type: 'object'
                        }, schemasTypes, options);
                    } else if (bodySchemaDef['$ref']) {
                        const ref = bodySchemaDef['$ref'].toString();
                        res = Property.fromDefinition('', 'body', {
                            ...bodySchemaDef as OpenApiProperty,
                            $ref: ref.startsWith(SHARED_BODIES_PREFIX) ? SCHEMA_PREFIX + ref.substring(SHARED_BODIES_PREFIX.length, ref.length) : ref,
                            required: bodyRequired
                        }, schemasTypes, options);
                    } else if (bodySchemaDef['type']) {
                        res = Property.fromDefinition('', 'body', {
                            type: bodySchemaDef['type'],
                            required: bodyRequired
                        }, schemasTypes, options);
                    } else {
                        // inplace object
                        inPlaceClassname = NameUtils.normaliseClassname(def.operationId + 'Body$' + method);
                        res = Property.fromDefinition(
                            inPlaceClassname,
                            'body',
                            {
                                ...bodySchemaDef as OpenApiProperty,
                                $ref: SCHEMA_PREFIX + inPlaceClassname
                            },
                            schemasTypes.appended(inPlaceClassname, 'object'),
                            options
                        );
                    }

                    if (res.schemaType === 'property') {
                        // '--referencedObjectsNullableByDefault' flag makes body to be nullable by default, which
                        // may be wrong. We make nullable value true only if it is explicitly requested.
                        const bProperty = res as Property;
                        res = bProperty.copy({
                            nullable: bProperty.referencesObject ? option(bodySchemaDef['nullable']).contains(true) : bProperty.nullable,
                            required: bodyRequired
                        });
                    }
                    return {
                        body: res,
                        mimeType: mt,
                        suffix: supportedMimeTypes.size > 1 ? supportedBodyMimeTypes.get(mt).getOrElseValue(mt) : '',
                        inPlace: inPlaceClassname ? bodySchemaDef : undefined,
                        inPlaceClassname: inPlaceClassname,
                    } as RequestBody;
                });
            })
            .getOrElseValue(Nil);


        this.bodyDescription = option(def.requestBody).flatMap(body => option(body.description));


        const statusCodes = Collection.from(Object.keys(def.responses))
            .map(x => parseInt(x));

        const successCode = statusCodes
            .filter(code => code / 100 === 2)
            .minByOption(identity);

        const respDef = successCode.map(_ => def.responses[_])
            .orElse(() => option(def.responses['default']))
            .orElse(() => statusCodes.headOption.flatMap(code => option(def.responses[code])))
            .getOrElseValue({});

        const mimeTypes = option(respDef.content)
            .map(content => Collection.from(Object.keys(content)).toMap(mimeType =>
                [mimeType, content[mimeType]]
            )).getOrElseValue(HashMap.empty);

        const responseMimeType = mimeTypes.get('application/json')
            .map(_ => 'application/json')
            .orElse(() => mimeTypes.keySet.headOption)
            .getOrElseValue('application/json');
        const responseParseMode = Method.parseModeByMimeType(responseMimeType);

        this.response = mimeTypes.get(responseMimeType)
            .filter(p => option(p.schema).isDefined || responseParseMode === 'text')
            .map(p => {
                if (responseParseMode === 'text') {
                    const r = Property.fromDefinition('', '', {type: 'string'}, schemasTypes, options).copy({
                        nullable: false,
                        required: true,
                    });
                    return {
                        asProperty: r,
                        responseType: 'string',
                        description: respDef.description,
                        mimeType: responseMimeType,
                        parseMode: responseParseMode,
                    } as ResponseDetails;
                }

                if (p.schema.type === 'object' && p.schema['properties'] && Object.keys(p.schema['properties']).length > 0) {

                    const inPlaceObject = NameUtils.normaliseClassname(def.operationId + 'Response$' + method);

                    const r = Property.fromDefinition(
                        inPlaceObject,
                        '',
                        {
                            ...p.schema,
                            $ref: SCHEMA_PREFIX + inPlaceObject
                        },
                        schemasTypes.appended(inPlaceObject, 'object'),
                        options
                    ).copy({
                        nullable: false,
                        required: true
                    });
                    return {
                        asProperty: r,
                        responseType: inPlaceObject,
                        description: respDef.description,
                        inPlace: p.schema,
                        mimeType: responseMimeType,
                        parseMode: responseParseMode,
                    } as ResponseDetails;

                } else {
                    const r = Property.fromDefinition('', '', p.schema, schemasTypes, options).copy({
                        nullable: false,
                        required: true,
                    });
                    return {
                        asProperty: r,
                        responseType: r.jsType,
                        description: respDef.description,
                        mimeType: responseMimeType,
                        parseMode: responseParseMode,
                    } as ResponseDetails;
                }
            })
            .getOrElseValue(({
                asProperty: Property.fromDefinition('', 'UNKNOWN', {type: 'any'}, schemasTypes, options),
                responseType: 'any',
                mimeType: responseMimeType,
                parseMode: responseParseMode,
            }));


        this.wrapParamsInObject = this.parameters.size > 2 || (this.body.nonEmpty) && this.parameters.nonEmpty;

    }

    get endpointName() {
        return NameUtils.normaliseMethodName(this.operationId.getOrElse(() => `${this.method}${Method.pathToName(this.path)}`));
    }

    get pathWithSubstitutions(): string {
        const paramPrefix = `${this.wrapParamsInObject ? 'params.' : ''}`;
        return this.path.replace(/\{(\w+?)\}/g, (matched, group) => {
            const remappedName = this.parameters.find(p => p.name === group && p.in === 'path')
                .map(_ => _.uniqueName)
                .getOrElseValue(group);
            return `\${${paramPrefix}${remappedName}}`;
        });
    }

    static pathToName(path: string): string {
        const tokens = Collection.from(path.split('/'));
        return tokens.filter(t => t.length > 0).map(t => {
            let token = t;
            if (t[0] == '{') { // path param
                token = `By${this.capitalize(t.substring(1, t.length - 1))}`;
            }
            return Collection.from(token.split(/\W/)).map(_ => this.capitalize(_)).mkString();
        }).mkString();
    }

    static capitalize(s: string) {
        if (s.length <= 0) {
            return s;
        } else {
            return s[0].toUpperCase() + s.substring(1);
        }
    }
}
