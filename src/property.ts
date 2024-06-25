import {OpenApiProperty} from './openapi.js';
import {Collection, HashMap, Option, option} from 'scats';
import {GenerationOptions, Schema, SchemaType} from './schemas.js';

const SCHEMA_PREFIX = '#/components/schemas/';

export class Property implements Schema {

    readonly schemaType = 'property';

    constructor(readonly name: string,
                readonly type: string,
                readonly description: Option<string>,
                readonly defaultValue: any,
                readonly nullable: boolean,
                readonly required: boolean,
                readonly items: string,
                readonly referencesObject: boolean,
                readonly itemReferencesObject: boolean) {
    }


    copy(p: Partial<Property>): Property {
        return new Property(
            option(p.name).getOrElseValue(this.name),
            option(p.type).getOrElseValue(this.type),
            option(p.description).getOrElseValue(this.description),
            option(p.defaultValue).getOrElseValue(this.defaultValue),
            option(p.nullable).getOrElseValue(this.nullable),
            option(p.required).getOrElseValue(this.required),
            option(p.items).getOrElseValue(this.items),
            option(p.referencesObject).getOrElseValue(this.referencesObject),
            option(p.itemReferencesObject).getOrElseValue(this.itemReferencesObject),
        );
    }

    static fromDefinition(name: string,
                          definition: OpenApiProperty,
                          schemas: HashMap<string, SchemaType>,
                          options: GenerationOptions) {

        const referencesObject = option(definition.$ref)
            .exists(ref => schemas.get(ref.substring(SCHEMA_PREFIX.length)).contains('object'));

        const itemReferencesObject = option(definition.items)
            .flatMap(i => option(i.$ref))
            .exists(ref => schemas.get(ref.substring(SCHEMA_PREFIX.length)).contains('object'));

        const type = option(definition.$ref)
            .map(ref => ref.substring(SCHEMA_PREFIX.length))
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
                        ).mkString(' | ');
                    })
            )
            .getOrElseValue(definition.type);

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

        return new Property(name, type, description, null, nullable, required, items, referencesObject, itemReferencesObject);
    }


    get jsType(): string {
        let res = Property.toJsType(this.type, this.items);
        if (this.nullable) {
            res = res + ' | null';
        }
        return res;

    }

    get isArray(): boolean {
        return this.type === 'array';
    }

    static toJsType(tpe: string, itemTpe = 'any'): string {
        switch (tpe) {
            case 'integer': return 'number';
            case 'array': return `ReadonlyArray<${Property.toJsType(itemTpe)}>`;
            default: return tpe;
        }
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
                return `${this.items}Dto`;
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
            return !this.nullable && this.required ? `${this.type}Dto` : `Option<${this.type}Dto>`;
        } else if (this.isArray) {
            if (this.itemReferencesObject) {
                return `Collection<${this.items}Dto>`;
            } else {
                return `Collection<${Property.toJsType(this.items)}>`;
            }
        } else {
            const jsType = Property.toJsType(this.type, this.items);
            return !this.nullable && this.required ? this.jsType : `Option<${jsType}>`;
        }
    }
}
