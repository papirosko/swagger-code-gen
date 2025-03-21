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
                readonly inPlace: Option<OpenApiSchema>) {
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
            .exists(ref => schemaTypes.get(ref.substring(SCHEMA_PREFIX.length)).contains('object'));

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
                            option(oneOfItem.$ref)
                                .map(ref => ref.substring(SCHEMA_PREFIX.length))
                                .orElseValue(option(oneOfItem.type))
                        ).mkString(' & ')
                    )
            )
            .orElse(() =>
                option(definition.oneOf)
                    .map(x => Collection.from(x))
                    .filter(x => x.nonEmpty)
                    .map(x =>
                        x.flatMapOption(oneOfItem =>
                            option(oneOfItem.$ref)
                                .map(ref => ref.substring(SCHEMA_PREFIX.length))
                                .orElseValue(option(oneOfItem.type))
                        ).mkString(' | ')
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
                                option(oneOfItem.$ref)
                                    .map(ref => ref.substring(SCHEMA_PREFIX.length))
                                    .orElseValue(option(oneOfItem.type))
                            )
                            .map(tpe => this.toJsType(tpe))
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
            .orElseValue(option(definition.items?.type))
            .orElse(() =>
                option(definition.items?.oneOf)
                    .map(x => Collection.from(x))
                    .filter(x => x.nonEmpty)
                    .map(x =>
                        x.flatMapOption(oneOfItem =>
                            option(oneOfItem.$ref)
                                .map(ref => ref.substring(SCHEMA_PREFIX.length))
                                .orElseValue(option(oneOfItem.type))
                        ).mkString(' | ')
                    )
            )
            .getOrElseValue('any');

        const enumValues = option(definition.enum).map(x => Collection.from(x));

        return new Property(name, type, option(definition.format), description, null, nullable, required,
            items, referencesObject, itemReferencesObject, enumValues, inplace);
    }


    get jsType(): string {
        let res = Property.toJsType(this.type, this.items, this.format);
        if (this.nullable) {
            res = res + ' | null';
        } else if (this.enumValues.exists(x => x.nonEmpty)) {
            res = this.enumValues.get
                .map(enumValue => {
                    if (this.type === 'string') {
                        return `'${enumValue}'`;
                    } else {
                        return enumValue;
                    }
                })
                .mkString(' | ');
        }
        return res;

    }

    get isArray(): boolean {
        return this.type === 'array';
    }

    static toJsType(tpe: string, itemTpe = 'any', format: Option<string> = none): string {
        return option(tpe)
            .map(x => Collection.from(x.split('|')))
            .getOrElseValue(Nil)
            .map(x => x.trim())
            .map(t => {
                switch (t) {
                    case 'boolean':
                        return 'boolean';
                    case 'number':
                        return 'number';
                    case 'integer':
                        return 'number';
                    case 'Object':
                    case 'object':
                        return 'object';
                    case 'file':
                        return 'File';
                    case 'any':
                        return 'any';
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
                        return NameUtils.normaliseClassname(tpe);
                }
            })
            .distinct.mkString(' | ');

    }

    get normalType() {
        return NameUtils.normaliseClassname(this.type);
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
            if (this.enumValues.exists(x => x.nonEmpty)) {
                jsType = this.enumValues.get
                    .map(enumValue => {
                        if (this.type === 'string') {
                            return `'${enumValue}'`;
                        } else {
                            return enumValue;
                        }
                    })
                    .mkString(' | ');
            }
            return !this.nullable && this.required ? this.jsType : `Option<${jsType}>`;
        }
    }
}
