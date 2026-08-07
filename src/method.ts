import {OpenApiMethod, OpenApiParam, OpenApiProperty, OpenApiResponse, OpenApiSchema} from './openapi.js';
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
    rawSchema?: OpenApiSchema;
    responseType: string;
    description?: string;
    mimeType: string;
    parseMode: 'json' | 'text' | 'bytes';
    noContent: boolean;
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
    rawSchema?: OpenApiSchema;
}

type BodyContentMap = {
    [mimeType: string]: {
        schema: OpenApiSchema;
    };
};


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

    private static parseModeByMimeType(mimeType: string): 'json' | 'text' | 'bytes' {
        if (mimeType === 'application/octet-stream') {
            return 'bytes';
        }
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
                pool: HashMap<string, Schema>,
                pathLevelParameters: OpenApiParam[] = []) {
        this.tags = HashSet.from(option(def.tags).getOrElseValue([]));
        this.summary = def.summary;
        this.description = def.description;
        this.operationId = option(def.operationId);

        // Merge path-level and operation-level parameters.
        // Operation-level params override path-level ones with the same name+in combination.
        const operationParams = option(def.parameters).getOrElseValue([]);
        const operationParamKeys = new Set(operationParams.map(p => `${p.in}:${p.name}`));
        const mergedParams = [
            ...pathLevelParameters.filter(p => !operationParamKeys.has(`${p.in}:${p.name}`)),
            ...operationParams,
        ];

        const parameters = Collection.from(mergedParams)
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
            .flatMap(requestBody =>
                option(requestBody.content)
                    .orElse(() => {
                        // reference to shared body
                        return option(requestBody).filter(x =>
                            option(x.$ref).exists(ref => ref.startsWith(SHARED_BODIES_PREFIX))
                        )
                            .map(x => {
                                const sharedRef = x.$ref!;
                                const referenced = pool.get(sharedRef.substring(SHARED_BODIES_PREFIX.length) + '$RequestBody');
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
                                                $ref: sharedRef + '$RequestBody'
                                            } as unknown as OpenApiSchema,
                                        }
                                    } as BodyContentMap;
                                }
                            });
                    })
            )
            .map(body => {
                const bodyRequired = option(def.requestBody?.required).contains(true);
                const mimeTypes = Collection.from(Object.keys(body));
                const supportedMimeTypes = mimeTypes.filter(_ => supportedBodyMimeTypes.containsKey(_));
                return supportedMimeTypes.map(mt => {
                    const bodyEntry = body[mt];
                    if (!bodyEntry) {
                        throw new Error(`No request body definition for mime type ${mt}`);
                    }
                    const bodySchemaDef = bodyEntry.schema;
                    let res: Schema;
                    let inPlaceClassname: string | null = null;
                    if (SchemaFactory.isEmptyObjectOrArray(bodySchemaDef)) {
                        res = Property.fromDefinition('', 'body', {
                            ...bodySchemaDef as OpenApiProperty,
                            required: bodyRequired,
                            type: 'object'
                        }, schemasTypes, options);
                    } else if (bodySchemaDef.$ref) {
                        const ref = bodySchemaDef.$ref;
                        res = Property.fromDefinition('', 'body', {
                            ...bodySchemaDef as OpenApiProperty,
                            $ref: ref.startsWith(SHARED_BODIES_PREFIX) ? SCHEMA_PREFIX + ref.substring(SHARED_BODIES_PREFIX.length, ref.length) : ref,
                            required: bodyRequired
                        }, schemasTypes, options);
                    } else if (
                        bodySchemaDef.type === 'object' &&
                        option(bodySchemaDef.properties).map(props => Object.keys(props).length).getOrElseValue(0) > 0
                    ) {
                        // inplace object
                        const operationName = def.operationId ?? `${method}${Method.pathToName(path)}`;
                        inPlaceClassname = NameUtils.normaliseClassname(operationName + 'Body$' + method);
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
                    } else if (bodySchemaDef.type || bodySchemaDef.oneOf || bodySchemaDef.anyOf) {
                        res = Property.fromDefinition('', 'body', {
                            ...bodySchemaDef as OpenApiProperty,
                            required: bodyRequired
                        }, schemasTypes, options);
                    } else {
                        // inplace object
                        const operationName = def.operationId ?? `${method}${Method.pathToName(path)}`;
                        inPlaceClassname = NameUtils.normaliseClassname(operationName + 'Body$' + method);
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
                            nullable: bProperty.referencesObject ? option(bodySchemaDef.nullable).contains(true) : bProperty.nullable,
                            required: bodyRequired
                        });
                    }
                    return {
                        body: res,
                        mimeType: mt,
                        suffix: supportedMimeTypes.size > 1 ? supportedBodyMimeTypes.get(mt).getOrElseValue(mt) : '',
                        inPlace: inPlaceClassname ? bodySchemaDef : undefined,
                        inPlaceClassname: inPlaceClassname,
                        rawSchema: bodySchemaDef,
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

        const respDef = successCode.flatMap(code => option(def.responses[String(code)]))
            .orElse(() => option(def.responses['default']))
            .orElse(() => statusCodes.headOption.flatMap(code => option(def.responses[String(code)])))
            .getOrElseValue({} as OpenApiResponse);

        const mimeTypes = option(respDef.content)
            .map(content => Collection.from(Object.entries(content) as Array<[string, { schema: OpenApiSchema }]>).toMap(entry => entry))
            .getOrElseValue(HashMap.empty);

        const responseMimeType = mimeTypes.get('application/json')
            .map(_ => 'application/json')
            .orElse(() => mimeTypes.keySet.headOption)
            .getOrElseValue('application/json');
        const responseParseMode = Method.parseModeByMimeType(responseMimeType);

        if (mimeTypes.isEmpty) {
            this.response = {
                asProperty: Property.fromDefinition('', 'UNKNOWN', {type: 'any'}, schemasTypes, options),
                responseType: 'void',
                description: respDef.description,
                mimeType: responseMimeType,
                parseMode: responseParseMode,
                noContent: true,
            } as ResponseDetails;
        } else {
            this.response = mimeTypes.get(responseMimeType)
                .filter(p => option(p.schema).isDefined || responseParseMode === 'text' || responseParseMode === 'bytes')
                .map(p => {
                const responseSchema = p.schema;

                if (responseParseMode === 'bytes') {
                    const r = Property.fromDefinition('', '', {type: 'any'}, schemasTypes, options).copy({
                        nullable: false,
                        required: true,
                    });
                    return {
                        asProperty: r,
                        responseType: 'any',
                        description: respDef.description,
                        mimeType: responseMimeType,
                        parseMode: responseParseMode,
                        noContent: false,
                        rawSchema: responseSchema,
                    } as ResponseDetails;
                }

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
                        noContent: false,
                        rawSchema: responseSchema,
                    } as ResponseDetails;
                }

                if (responseSchema.type === 'object' && responseSchema.properties && Object.keys(responseSchema.properties).length > 0) {

                    const operationName = def.operationId ?? `${method}${Method.pathToName(path)}`;
                    const inPlaceObject = NameUtils.normaliseClassname(operationName + 'Response$' + method);

                    const r = Property.fromDefinition(
                        inPlaceObject,
                        '',
                        {
                            ...responseSchema,
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
                        inPlace: responseSchema,
                        mimeType: responseMimeType,
                        parseMode: responseParseMode,
                        noContent: false,
                        rawSchema: responseSchema,
                    } as ResponseDetails;

                } else {
                    const r = Property.fromDefinition('', '', responseSchema, schemasTypes, options).copy({
                        nullable: false,
                        required: true,
                    });
                    return {
                        asProperty: r,
                        responseType: r.jsType,
                        description: respDef.description,
                        mimeType: responseMimeType,
                        parseMode: responseParseMode,
                        noContent: false,
                        rawSchema: responseSchema,
                    } as ResponseDetails;
                }
            })
                .getOrElseValue(({
                    asProperty: Property.fromDefinition('', 'UNKNOWN', {type: 'any'}, schemasTypes, options),
                    responseType: 'any',
                    mimeType: responseMimeType,
                    parseMode: responseParseMode,
                    noContent: false,
                }));
        }


        this.wrapParamsInObject = this.parameters.size > 2 || (this.body.nonEmpty) && this.parameters.nonEmpty;

    }

    get endpointName() {
        return NameUtils.normaliseMethodName(this.operationId.getOrElse(() => `${this.method}${Method.pathToName(this.path)}`));
    }

    get pathWithSubstitutions(): string {
        const paramPrefix = `${this.wrapParamsInObject ? 'params.' : ''}`;
        return this.path.replace(/\{(\w+?)}/g, (matched, group) => {
            const remappedName = this.parameters.find(p => p.rawName === group && p.in === 'path')
                .map(_ => _.uniqueName)
                .getOrElseValue(group);
            return `\${encodeURIComponent(String(${paramPrefix}${remappedName}))}`;
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
            return s.charAt(0).toUpperCase() + s.substring(1);
        }
    }
}
