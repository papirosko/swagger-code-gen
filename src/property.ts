import {OpenApiProperty, OpenApiSchema} from './openapi.js';
import {Collection, HashMap, Nil, none, Option, option, some} from 'scats';
import {GenerationOptions, Schema, SchemaFactory, SchemaType} from './schemas.js';
import {NameUtils} from './name.utils.js';

export const SCHEMA_PREFIX = '#/components/schemas/';

export class Property implements Schema {

    readonly schemaType = 'property';

    constructor(readonly name: string,
                readonly type: string,
                readonly format: Option<string>,
                readonly description: Option<string>,
                readonly defaultValue: any,
                readonly nullable: boolean,
                readonly required: boolean,
                readonly items: string,
                readonly referencesObject: boolean,
                readonly itemReferencesObject: boolean,
                readonly enumValues: Option<Collection<string>>,
                readonly inPlace: Option<OpenApiSchema>,
                readonly safeName?: string) {
    }


    copy(p: Partial<Property>): Property {
        return new Property(
            option(p.name).getOrElseValue(this.name),
            option(p.type).getOrElseValue(this.type),
            option(p.format).getOrElseValue(this.format),
            option(p.description).getOrElseValue(this.description),
            option(p.defaultValue).getOrElseValue(this.defaultValue),
            option(p.nullable).getOrElseValue(this.nullable),
            option(p.required).getOrElseValue(this.required),
            option(p.items).getOrElseValue(this.items),
            option(p.referencesObject).getOrElseValue(this.referencesObject),
            option(p.itemReferencesObject).getOrElseValue(this.itemReferencesObject),
            option(p.enumValues).getOrElseValue(this.enumValues),
            option(p.inPlace).getOrElseValue(this.inPlace),
            option(p.safeName).getOrElseValue(this.safeName),
        );
    }

    static fromDefinition(parentClassname: string,
                          name: string,
                          definition: OpenApiProperty,
                          schemaTypes: HashMap<string, SchemaType>,
                          options: GenerationOptions) {
        const referencesObject: boolean = option(definition.$ref)
                .exists(ref => schemaTypes.get(ref.substring(SCHEMA_PREFIX.length)).contains('object')) ||
            // $ref cant have sublings. in case of description it should be wrapped in allOf:
            // https://github.com/nestjs/swagger/issues/2948#issuecomment-2440965892
            option(definition.allOf)
                .filter(allOf => allOf.length === 1)
                .flatMap(allOf => option(allOf[0]))
                .flatMap(schema => option(schema.$ref))
                .exists(ref => schemaTypes.get(ref.substring(SCHEMA_PREFIX.length)).contains('object'));


        const itemReferencesObject = option(definition.items)
                .flatMap(i => option(i.$ref))
                .exists(ref => schemaTypes.get(ref.substring(SCHEMA_PREFIX.length)).contains('object')) ||
            option(definition.items).exists(i =>
                option(i.type).contains('object') &&
                option(i.properties).map(p => Object.keys(p).length).getOrElseValue(0) > 0);

        let inplace = none;
        const type = option(definition.$ref).map(ref => ref.substring(SCHEMA_PREFIX.length))
            .orElse(() => {
                if (definition.type === 'object' && option(definition.properties).map(p => Object.keys(p).length).getOrElseValue(0) > 0) {
                    // inplace object
                    inplace = some(definition);
                    return some(parentClassname + '$' + name);
                } else {
                    return none;
                }
            })
            .orElse(() =>
                option(definition.allOf)
                    .map(x => Collection.from(x))
                    .filter(x => x.nonEmpty)
                    .map(x =>
                        x.flatMapOption(oneOfItem =>
                            Property.definitionToTypeString(oneOfItem as OpenApiProperty, schemaTypes, options)
                                .map(typeValue => Property.finalizeResolvedType(typeValue, oneOfItem as OpenApiProperty))
                        ).mkString(' & ')
                    )
            )
            .orElse(() =>
                option(definition.oneOf)
                    .map(x => Collection.from(x))
                    .filter(x => x.nonEmpty)
                    .map(x =>
                        x.flatMapOption(oneOfItem =>
                            Property.definitionToTypeString(oneOfItem as OpenApiProperty, schemaTypes, options)
                                .map(typeValue => Property.finalizeResolvedType(typeValue, oneOfItem as OpenApiProperty))
                        ).distinct.mkString(' | ')
                    )
            )
            .orElse(() =>
                option(definition.anyOf)
                    .map(x => Collection.from(x))
                    .filter(x => x.nonEmpty)
                    .map(x => {
                        return x
                            .filter(t => t.type !== 'null')
                            .flatMapOption(oneOfItem =>
                                Property.definitionToTypeString(oneOfItem as OpenApiProperty, schemaTypes, options)
                                    .map(typeValue => Property.finalizeResolvedType(typeValue, oneOfItem as OpenApiProperty))
                            )
                            .distinct
                            .mkString(' | ');
                    })
            )
            .orElse(() => {
                if (SchemaFactory.isEmptyObjectOrArray(definition)) {
                    return some('object');
                } else {
                    return none;
                }
            })
            .orElse(() => option(definition.type))
            .getOrElseValue('any');

        const nullable = option(definition.nullable).contains(true) ||
            (referencesObject && options.referencedObjectsNullableByDefault && !option(definition.nullable).contains(false)) ||
            option(definition.anyOf)
                .map(x => Collection.from(x))
                .filter(x => x.nonEmpty)
                .exists(anyOf => anyOf.exists(t => t.type === 'null'))
        ;

        const description = option(definition.description);
        // fields are not required by default
        const required = option(definition.required).contains(true);

        const items = option(definition.items?.$ref)
            .map(ref => ref.substring(SCHEMA_PREFIX.length))
            .orElse(() => {
                if (definition.type === 'array' && option(definition.items).exists(i => i.type === 'object')) {
                    inplace = some(definition.items);
                    return some(parentClassname + '$' + name);
                } else {
                    return none;
                }
            })
            .orElseValue(option(definition.items?.type))
            .orElse(() =>
                option(definition.items?.oneOf)
                    .map(x => Collection.from(x))
                    .filter(x => x.nonEmpty)
                    .map(x =>
                        x.flatMapOption(oneOfItem =>
                            Property.definitionToTypeString(oneOfItem as OpenApiProperty, schemaTypes, options)
                                .map(typeValue => Property.finalizeResolvedType(typeValue, oneOfItem as OpenApiProperty))
                        ).mkString(' | ')
                    )
            )
            .getOrElseValue('any');

        const enumValues = option(definition.enum).map(x => Collection.from(x));

        return new Property(name, type, option(definition.format), description, null, nullable, required,
            items, referencesObject, itemReferencesObject, enumValues, inplace);
    }

    private static definitionToTypeString(
        definition: OpenApiProperty,
        schemaTypes: HashMap<string, SchemaType>,
        options: GenerationOptions
    ): Option<string> {
        return option(definition.$ref)
            .map(ref => ref.substring(SCHEMA_PREFIX.length))
            .orElse(() =>
                option(definition.oneOf)
                    .map(items => Collection.from(items))
                    .filter(items => items.nonEmpty)
                    .map(items => items
                        .flatMapOption(item => Property.definitionToTypeString(item as OpenApiProperty, schemaTypes, options))
                        .distinct
                        .mkString(' | ')
                    )
            )
            .orElse(() =>
                option(definition.allOf)
                    .map(items => Collection.from(items))
                    .filter(items => items.nonEmpty)
                    .map(items => items
                        .flatMapOption(item => Property.definitionToTypeString(item as OpenApiProperty, schemaTypes, options))
                        .distinct
                        .mkString(' & ')
                    )
            )
            .orElse(() =>
                option(definition.anyOf)
                    .map(items => Collection.from(items))
                    .filter(items => items.nonEmpty)
                    .map(items => {
                        const includesNull = items.exists(item => item.type === 'null');
                        const base = items
                            .filter(item => item.type !== 'null')
                            .flatMapOption(item => Property.definitionToTypeString(item as OpenApiProperty, schemaTypes, options))
                            .distinct
                            .mkString(' | ');
                        return includesNull && base.length > 0 ? `${base} | null` : base;
                    })
            )
            .orElse(() => {
                if (definition.type === 'object' && option(definition.properties).map(props => Object.keys(props).length).getOrElseValue(0) > 0) {
                    return some(Property.objectDefinitionToLiteral(definition, schemaTypes, options));
                }
                return none;
            })
            .orElse(() => {
                if (definition.type === 'array') {
                    const itemType = option(definition.items)
                        .flatMap(item => Property.definitionToTypeString(item, schemaTypes, options)
                            .map(typeValue => Property.finalizeResolvedType(typeValue, item)))
                        .getOrElseValue('any');
                    return some(`ReadonlyArray<${itemType}>`);
                }
                return none;
            })
            .orElse(() => option(definition.type));
    }

    private static finalizeResolvedType(typeValue: string, definition?: OpenApiProperty): string {
        const arrayMatch = typeValue.match(/^ReadonlyArray<(.+)>$/);
        if (arrayMatch) {
            const nestedDefinition = definition?.items;
            return `ReadonlyArray<${Property.finalizeResolvedType(arrayMatch[1], nestedDefinition)}>`;
        }
        if (typeValue.includes('{')) {
            return typeValue;
        }
        return Property.toJsType(typeValue, undefined, option(definition?.format));
    }

    private static objectDefinitionToLiteral(
        definition: OpenApiProperty,
        schemaTypes: HashMap<string, SchemaType>,
        options: GenerationOptions
    ): string {
        const properties = option(definition.properties).getOrElseValue({});
        const requiredProps = new Set(Array.isArray((definition as any).required) ? (definition as any).required : []);
        const formatPropertyName = (propertyName: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(propertyName)
            ? propertyName
            : `'${propertyName}'`;

        const entries = Object.keys(properties).map(propertyName => {
            const propertyDefinition = properties[propertyName] as OpenApiProperty;
            const propertyType = Property.definitionToTypeString(propertyDefinition, schemaTypes, options)
                .map(typeValue => Property.finalizeResolvedType(typeValue, propertyDefinition))
                .getOrElseValue('any');
            const optionalMark = requiredProps.has(propertyName) ? '' : '?';
            return `${formatPropertyName(propertyName)}${optionalMark}: ${propertyType}`;
        });

        return `{ ${entries.join('; ')} }`;
    }


    get jsType(): string {
        let res = Property.toJsType(this.type, this.items, this.format);
        const typeTokens = Collection.from(Array.isArray(this.type) ? this.type : this.type.split('|'))
            .map(t => t.trim());
        const isStringLike = typeTokens.exists(t => t === 'string' || t === 'String');
        const isNullableType = this.nullable || typeTokens.exists(t => t === 'null');
        if (this.enumValues.exists(x => x.nonEmpty)) {
            res = this.enumValues.get
                .filter(v => v != null)
                .map(enumValue => {
                    if (isStringLike) {
                        return `'${enumValue}'`;
                    } else {
                        return enumValue;
                    }
                })
                .mkString(' | ');
        }
        if (isNullableType) {
            res = res + ' | null';
        }
        // Deduplicate union members (e.g. multiple inline objects resolving to 'object')
        res = [...new Set(res.split(' | ').map(t => {
            switch (t) { case 'String': return 'string'; case 'Number': return 'number'; case 'Boolean': return 'boolean'; case 'Object': return 'object'; default: return t; }
        }))].join(' | ');
        return res;

    }

    get isArray(): boolean {
        return this.type === 'array';
    }

    get normalName(): string {
        return NameUtils.normaliseClassname(this.name);
    }

    static toJsType(tpe: string, itemTpe = 'any', format: Option<string> = none): string {
        return option(tpe)
            .map(x => Array.isArray(x) ? Collection.from(x) : Collection.from(x.split('|')))
            .getOrElseValue(Nil)
            .map(x => x.trim())
            .map(t => {
                switch (t) {
                    case 'Boolean':
                    case 'boolean':
                        return 'boolean';
                    case 'Number':
                    case 'number':
                    case 'integer':
                        return 'number';
                    case 'Object':
                    case 'object':
                        return 'object';
                    case 'file':
                        return 'File';
                    case 'any':
                        return 'any';
                    case 'null':
                        return 'null';
                    case 'String':
                    case 'string':
                        if (format.contains('binary')) {
                            return 'Blob | Buffer';
                        } else {
                            return 'string';
                        }
                    case 'array':
                        return `ReadonlyArray<${Property.toJsType(itemTpe)}>`;
                    default:
                        return NameUtils.normaliseClassname(t);
                }
            })
            .distinct.mkString(' | ');

    }

    get normalType() {
        return NameUtils.normaliseClassname(this.type);
    }


    get normalisedName() {
        return this.safeName || NameUtils.normalisePropertyName(this.name);
    }

    /**
     * If the property is array, then return scats wrapper type for item property,
     * else return scatsWrapperType for main type.
     * Examples:
     * - schema { type=array, item=Foo } => FooDto
     * - schema { type=array, item=Foo, nullable=true } => FooDto
     * - schema { type=array, item=number } => number
     * - schema { type=array, ref=number, nullable=true } => number
     *
     * - schema { type=object, ref=Foo } => FooDto
     * - schema { type=object, ref=Foo, nullable=true } => Option<FooDto>
     * - schema { type=number } => number
     * - schema { type=object, ref=number, nullable=true } => Option<number>
     */
    get itemScatsWrapperType(): string {
        if (this.isArray) {
            if (this.itemReferencesObject) {
                const cls = NameUtils.normaliseClassname(this.items);
                return `${cls}Dto`;
            } else {
                return Property.toJsType(this.items);
            }

        } else {
            return this.scatsWrapperType;
        }
    }

    /**
     * returns the type of the wrapper object in case the property type is object,
     * or the actual property type.
     * Examples:
     * - schema { type=object, ref=Foo } => FooDto
     * - schema { type=object, ref=Foo, nullable=true } => Option<FooDto>
     * - schema { type=array, item=Foo } => Collection<FooDto>
     * - schema { type=array, item=Foo, nullable=true } => Collection<FooDto>
     * - schema { type=number } => number
     * - schema { type=object, ref=number, nullable=true } => Option<number>
     * - schema { type=array, item=number } => Collection<number>
     * - schema { type=array, ref=number, nullable=true } => Collection<number>
     */
    get scatsWrapperType(): string {

        if (this.referencesObject) {
            const cls = NameUtils.normaliseClassname(this.type);
            return !this.nullable && this.required ? `${cls}Dto` : `Option<${cls}Dto>`;
        } else if (this.isArray) {
            if (this.itemReferencesObject) {
                const cls = NameUtils.normaliseClassname(this.items);
                return `Collection<${cls}Dto>`;
            } else {
                return `Collection<${Property.toJsType(this.items)}>`;
            }
        } else {
            let jsType = Property.toJsType(this.type, this.items, this.format);
            const typeTokens = Collection.from(Array.isArray(this.type) ? this.type : this.type.split('|'))
                .map(t => t.trim());
            const isStringLike = typeTokens.exists(t => t === 'string' || t === 'String');
            if (this.enumValues.exists(x => x.nonEmpty)) {
                jsType = this.enumValues.get
                    .filter(v => v != null)
                    .map(enumValue => {
                        if (isStringLike) {
                            return `'${enumValue}'`;
                        } else {
                            return enumValue;
                        }
                    })
                    .mkString(' | ');
            }
            jsType = [...new Set(jsType.split(' | ').map(t => {
                switch (t) { case 'String': return 'string'; case 'Number': return 'number'; case 'Boolean': return 'boolean'; case 'Object': return 'object'; default: return t; }
            }))]
                .filter(t => t !== 'null')
                .join(' | ');
            return !this.nullable && this.required ? this.jsType : `Option<${jsType}>`;
        }
    }
}
