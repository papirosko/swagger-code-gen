import {OpenApiProperty, OpenApiSchema} from './openapi.js';
import {Collection, HashMap, Nil, none, Option, option, some} from 'scats';
import {GenerationOptions, Schema, SchemaFactory, SchemaType} from './schemas.js';
import {NameUtils} from './name.utils.js';

export const SCHEMA_PREFIX = '#/components/schemas/';

export class Property implements Schema {

    readonly schemaType = 'property';

    private static splitTopLevelUnion(typeValue: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let angleDepth = 0;
        let braceDepth = 0;
        let parenDepth = 0;
        let bracketDepth = 0;

        for (const char of typeValue) {
            switch (char) {
                case '<':
                    angleDepth += 1;
                    current += char;
                    break;
                case '>':
                    angleDepth = Math.max(0, angleDepth - 1);
                    current += char;
                    break;
                case '{':
                    braceDepth += 1;
                    current += char;
                    break;
                case '}':
                    braceDepth = Math.max(0, braceDepth - 1);
                    current += char;
                    break;
                case '(':
                    parenDepth += 1;
                    current += char;
                    break;
                case ')':
                    parenDepth = Math.max(0, parenDepth - 1);
                    current += char;
                    break;
                case '[':
                    bracketDepth += 1;
                    current += char;
                    break;
                case ']':
                    bracketDepth = Math.max(0, bracketDepth - 1);
                    current += char;
                    break;
                case '|':
                    if (angleDepth === 0 && braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
                        const trimmed = current.trim();
                        if (trimmed.length > 0) {
                            tokens.push(trimmed);
                        }
                        current = '';
                    } else {
                        current += char;
                    }
                    break;
                default:
                    current += char;
                    break;
            }
        }

        const trimmed = current.trim();
        if (trimmed.length > 0) {
            tokens.push(trimmed);
        }
        return tokens;
    }

    private static typeTokens(typeValue?: string | string[]): Collection<string> {
        return option(typeValue)
            .map(value => Array.isArray(value) ? Collection.from(value) : Collection.from(Property.splitTopLevelUnion(value)))
            .getOrElseValue(Nil)
            .map(token => token.trim())
            .filter(token => token.length > 0);
    }

    private static hasType(definition: OpenApiProperty | undefined, expectedType: string): boolean {
        return Property.typeTokens(definition?.type).exists(token => token === expectedType);
    }

    private static hasObjectProperties(definition: OpenApiProperty | undefined): boolean {
        return option(definition?.properties).map(p => Object.keys(p).length).getOrElseValue(0) > 0;
    }

    private static normalizedDefinitionType(typeValue: string | string[] | undefined, excludeNull: boolean): Option<string> {
        const tokens = Property.typeTokens(typeValue)
            .filter(token => !excludeNull || token !== 'null')
            .distinct;
        return tokens.nonEmpty ? some(tokens.mkString(' | ')) : none;
    }

    private static splitTopLevelIntersection(typeValue: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let angleDepth = 0;
        let braceDepth = 0;
        let parenDepth = 0;
        let bracketDepth = 0;

        for (const char of typeValue) {
            switch (char) {
                case '<':
                    angleDepth += 1;
                    current += char;
                    break;
                case '>':
                    angleDepth = Math.max(0, angleDepth - 1);
                    current += char;
                    break;
                case '{':
                    braceDepth += 1;
                    current += char;
                    break;
                case '}':
                    braceDepth = Math.max(0, braceDepth - 1);
                    current += char;
                    break;
                case '(':
                    parenDepth += 1;
                    current += char;
                    break;
                case ')':
                    parenDepth = Math.max(0, parenDepth - 1);
                    current += char;
                    break;
                case '[':
                    bracketDepth += 1;
                    current += char;
                    break;
                case ']':
                    bracketDepth = Math.max(0, bracketDepth - 1);
                    current += char;
                    break;
                case '&':
                    if (angleDepth === 0 && braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) {
                        const trimmed = current.trim();
                        if (trimmed.length > 0) {
                            tokens.push(trimmed);
                        }
                        current = '';
                    } else {
                        current += char;
                    }
                    break;
                default:
                    current += char;
                    break;
            }
        }

        const trimmed = current.trim();
        if (trimmed.length > 0) {
            tokens.push(trimmed);
        }
        return tokens;
    }

    private static readonly primitiveLikeTypes = new Set([
        'string',
        'number',
        'boolean',
        'object',
        'any',
        'unknown',
        'null',
        'File',
        'Blob',
        'Buffer',
        'ArrayBuffer',
        'FormData'
    ]);

    private static collectScatsDtoRefs(definition: OpenApiProperty | undefined,
                                       schemaTypes: HashMap<string, SchemaType>): Collection<string> {
        const refs = new Set<string>();

        const visit = (value: OpenApiProperty | OpenApiSchema | undefined) => {
            if (value == null) {
                return;
            }
            const ref = option(value.$ref)
                .map(raw => raw.substring(SCHEMA_PREFIX.length))
                .filter(name => schemaTypes.get(name).contains('object'));
            if (ref.nonEmpty) {
                refs.add(ref.get);
            }

            option((value as OpenApiProperty).items).foreach(item => visit(item));
            option(value.oneOf).foreach(items => items.forEach(item => visit(item as OpenApiProperty)));
            option(value.allOf).foreach(items => items.forEach(item => visit(item as OpenApiProperty)));
            option(value.anyOf).foreach(items => items.forEach(item => visit(item as OpenApiProperty)));
        };

        visit(definition);
        return Collection.from(Array.from(refs));
    }

    private static isLiteralVariant(typeValue: string): boolean {
        return /^'.*'$/.test(typeValue) || /^".*"$/.test(typeValue) || /^-?\d+(\.\d+)?$/.test(typeValue) || typeValue === 'true' || typeValue === 'false';
    }

    private static isInlineObjectVariant(typeValue: string): boolean {
        return typeValue.startsWith('{') && typeValue.endsWith('}');
    }

    private static quoteTsStringLiteral(value: string): string {
        return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}'`;
    }

    private static arrayInnerType(typeValue: string): string | null {
        const arrayMatch = typeValue.match(/^ReadonlyArray<(.+)>$/);
        return arrayMatch?.[1] ?? null;
    }

    private static renderScatsIntersection(typeValue: string, scatsDtoRefs: Collection<string>): string {
        const parts = Property.splitTopLevelIntersection(typeValue).map(part => Property.renderScatsVariant(part, scatsDtoRefs));
        return [...new Set(parts)].join(' & ');
    }

    private static renderScatsVariant(typeValue: string, scatsDtoRefs: Collection<string>): string {
        const arrayInner = Property.arrayInnerType(typeValue);
        if (arrayInner != null) {
            return `Collection<${Property.renderScatsType(arrayInner, false, false, scatsDtoRefs)}>`;
        }
        if (Property.isInlineObjectVariant(typeValue)) {
            return typeValue;
        }
        if (typeValue.includes('&')) {
            return Property.renderScatsIntersection(typeValue, scatsDtoRefs);
        }
        if (Property.primitiveLikeTypes.has(typeValue) || Property.isLiteralVariant(typeValue)) {
            return typeValue;
        }
        return scatsDtoRefs.exists(ref => NameUtils.normaliseClassname(ref) === typeValue) ? `${NameUtils.normaliseClassname(typeValue)}Dto` : typeValue;
    }

    private static renderScatsType(typeValue: string,
                                   wrapNullableWithOption: boolean,
                                   forceOuterOption = false,
                                   scatsDtoRefs: Collection<string> = Nil): string {
        const variants = Property.typeTokens(typeValue).distinct;
        const hasNull = variants.exists(token => token === 'null');
        const nonNullVariants = variants.filter(token => token !== 'null');

        const arrayInners = nonNullVariants
            .flatMapOption(token => option(Property.arrayInnerType(token)));
        const areAllVariantsArrays = nonNullVariants.nonEmpty && arrayInners.size === nonNullVariants.size;

        if (areAllVariantsArrays) {
            const renderedInner = arrayInners
                .flatMap(inner => Property.typeTokens(Property.renderScatsType(inner, false, false, scatsDtoRefs)))
                .distinct
                .mkString(' | ');
            return `Collection<${renderedInner}>`;
        }

        const renderedVariants = nonNullVariants
            .map(token => Property.renderScatsVariant(token, scatsDtoRefs))
            .flatMap(token => Property.typeTokens(token))
            .distinct
            .mkString(' | ');

        if (hasNull || forceOuterOption) {
            return wrapNullableWithOption ? `Option<${renderedVariants}>` : `${renderedVariants} | null`;
        }
        return renderedVariants;
    }

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
                readonly scatsDtoRefs: Collection<string>,
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
            option(p.scatsDtoRefs).getOrElseValue(this.scatsDtoRefs),
            option(p.safeName).orElse(() => option(this.safeName)).orUndefined,
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
                (Property.hasType(i, 'object') || Property.hasObjectProperties(i)) &&
                Property.hasObjectProperties(i));

        let inplace = none;
        const type = option(definition.$ref).map(ref => ref.substring(SCHEMA_PREFIX.length))
            .orElse(() => {
                if (parentClassname !== '' && (Property.hasType(definition, 'object') || Property.hasObjectProperties(definition)) && Property.hasObjectProperties(definition)) {
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
                            .filter(t => !Property.hasType(t as OpenApiProperty, 'null'))
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
            .orElse(() => Property.normalizedDefinitionType(definition.type, true))
            .getOrElseValue('any');

        const nullable = option(definition.nullable).contains(true) ||
            Property.hasType(definition, 'null') ||
            (referencesObject && options.referencedObjectsNullableByDefault && !option(definition.nullable).contains(false)) ||
            option(definition.anyOf)
                .map(x => Collection.from(x))
                .filter(x => x.nonEmpty)
                .exists(anyOf => anyOf.exists(t => Property.hasType(t as OpenApiProperty, 'null')))
        ;

        const description = option(definition.description);
        // fields are not required by default
        const required = option(definition.required).contains(true);

        const items = option(definition.items?.$ref)
            .map(ref => ref.substring(SCHEMA_PREFIX.length))
            .orElse(() => {
                if (Property.hasType(definition, 'array') && option(definition.items).exists(i => Property.hasType(i, 'object') || Property.hasObjectProperties(i))) {
                    inplace = some(definition.items);
                    return some(parentClassname + '$' + name);
                } else {
                    return none;
                }
            })
            .orElse(() => Property.normalizedDefinitionType(definition.items?.type, false))
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
        const scatsDtoRefs = Property.collectScatsDtoRefs(definition, schemaTypes);

        return new Property(name, type, option(definition.format), description, null, nullable, required,
            items, referencesObject, itemReferencesObject, enumValues, inplace, scatsDtoRefs);
    }

    private static definitionToTypeString(
        definition: OpenApiProperty,
        schemaTypes: HashMap<string, SchemaType>,
        options: GenerationOptions
    ): Option<string> {
        return option(definition.$ref)
            .map(ref => ref.substring(SCHEMA_PREFIX.length))
            .orElse(() => {
                if ((Property.hasType(definition, 'object') || Property.hasObjectProperties(definition)) && Property.hasObjectProperties(definition)) {
                    return some(Property.objectDefinitionToLiteral(definition, schemaTypes, options));
                }
                return none;
            })
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
                        const includesNull = items.exists(item => Property.hasType(item as OpenApiProperty, 'null'));
                        const base = items
                            .filter(item => !Property.hasType(item as OpenApiProperty, 'null'))
                            .flatMapOption(item => Property.definitionToTypeString(item as OpenApiProperty, schemaTypes, options))
                            .distinct
                            .mkString(' | ');
                        return includesNull && base.length > 0 ? `${base} | null` : base;
                    })
            )
            .orElse(() => {
                if (Property.hasType(definition, 'array')) {
                    const itemType = option(definition.items)
                        .flatMap(item => Property.definitionToTypeString(item, schemaTypes, options)
                            .map(typeValue => Property.finalizeResolvedType(typeValue, item)))
                        .getOrElseValue('any');
                    return some(`ReadonlyArray<${itemType}>`);
                }
                return none;
            })
            .orElse(() => {
                return Property.normalizedDefinitionType(definition.type, false);
            });
    }

    private static finalizeResolvedType(typeValue: string, definition?: OpenApiProperty): string {
        const arrayMatch = typeValue.match(/^ReadonlyArray<(.+)>$/);
        if (arrayMatch) {
            const nestedDefinition = definition?.items;
            const nestedType = arrayMatch[1];
            if (!nestedType) {
                return typeValue;
            }
            return `ReadonlyArray<${Property.finalizeResolvedType(nestedType, nestedDefinition)}>`;
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
        const typeTokens = Property.typeTokens(this.type);
        const isStringLike = typeTokens.exists(t => t === 'string' || t === 'String');
        const isNullableType = this.nullable || typeTokens.exists(t => t === 'null');
        if (this.enumValues.exists(x => x.nonEmpty)) {
            res = this.enumValues.get
                .filter(v => v != null)
                .map(enumValue => {
                    if (isStringLike) {
                        return Property.quoteTsStringLiteral(String(enumValue));
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
        res = [...new Set(Property.typeTokens(res).toArray.map(t => {
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
        return Property.typeTokens(tpe)
            .map(t => {
                if (t.includes('{') || t.includes('<') || t.includes('&')) {
                    return t;
                }
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
            return Property.renderScatsType(Property.toJsType(this.items), false, false, this.scatsDtoRefs);

        } else {
            return this.scatsWrapperType;
        }
    }

    get itemScatsWrapperTypeHasFromJson(): boolean {
        return this.itemReferencesObject && this.itemScatsWrapperType.endsWith('Dto');
    }

    get scatsWrapperTypeIsCollection(): boolean {
        const tokens = Property.typeTokens(this.scatsWrapperType);
        return tokens.size === 1 && tokens.headOption.exists(token => token.startsWith('Collection<'));
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
        let jsType = this.jsType;
        if (this.enumValues.exists(x => x.nonEmpty)) {
            const typeTokens = Property.typeTokens(this.type);
            const isStringLike = typeTokens.exists(t => t === 'string' || t === 'String');
            jsType = this.enumValues.get
                .filter(v => v != null)
                .map(enumValue => {
                    if (isStringLike) {
                        return Property.quoteTsStringLiteral(String(enumValue));
                    } else {
                        return enumValue;
                    }
                })
                .mkString(' | ');
            if (this.nullable || Property.typeTokens(this.type).exists(t => t === 'null')) {
                jsType = `${jsType} | null`;
            }
        }
        return Property.renderScatsType(jsType, true, this.nullable || !this.required, this.scatsDtoRefs);
    }
}
