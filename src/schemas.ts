import {OpenApiProperty, OpenApiSchema} from './openapi.js';
import {Collection, HashMap, HashSet, Nil, Option, option} from 'scats';
import {Property, SCHEMA_PREFIX} from './property.js';
import {NameUtils} from './name.utils.js';

export type SchemaType = 'object' | 'enum' | 'property';

export interface Schema {
    readonly schemaType: SchemaType;
}

export interface GenerationOptions {
    referencedObjectsNullableByDefault: boolean;
    includeTags: HashSet<string>;
    excludeTags: HashSet<string>;
}

export class SchemaFactory {

    static isEmptyObjectOrArray(x: any) {
        if (Array.isArray(x) && x.length === 0) return true;
        if (typeof x === 'object' && Object.keys(x).length === 0) return true;
        return false;
    }

    static resolveSchemaType(def: OpenApiSchema): SchemaType {
        if (def.type === 'object' ||
            option(def.properties).exists(p => Object.keys(p).length > 0) ||
            option(def.allOf).exists(x => x.length > 0)  ||
            SchemaFactory.isEmptyObjectOrArray(def)
        ) {
            return 'object';
        } else if (def.enum) {
            return 'enum';
        } else {
            return 'property';
        }
    }


    static build(name: string,
                 def: OpenApiSchema,
                 schemasTypes: HashMap<string, SchemaType>,
                 options: GenerationOptions): Schema {
        if (def.type === 'object' ||
            option(def.properties).exists(p => Object.keys(p).length > 0) ||
            schemasTypes.get(name).contains('object')
        ) {
            return SchemaObject.fromDefinition(name, def, schemasTypes, options, HashMap.empty);
        } else if (def.enum) {
            return SchemaEnum.fromDefinition(name, def);
        } else if (def.type === 'string') {
            return Property.fromDefinition(name, {
                ...def as OpenApiProperty,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else if (def.type === 'boolean') {
            return Property.fromDefinition(name, {
                ...def as OpenApiProperty,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else if (def.type === 'integer') {
            return Property.fromDefinition(name, {
                ...def as OpenApiProperty,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else if (def.type === 'array') {
            return Property.fromDefinition(name, {
                ...def as OpenApiProperty,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else {
            return Property.fromDefinition(name, {
                ...def as OpenApiProperty,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
            // throw new Error(`unsupported schema type: ${def.type}`);
        }

    }

}


export class SchemaEnum implements Schema {
    readonly schemaType = 'enum';

    protected constructor(readonly name: string,
                          readonly title: string,
                          readonly description: Option<string>,
                          readonly type: string,
                          readonly defaultValue: Option<string | number>,
                          readonly values: Collection<string>) {
    }

    static fromDefinition(name: string, def: OpenApiSchema) {
        return new SchemaEnum(
            name,
            def.title,
            option(def.description),
            def.type,
            option(def.default),
            option(def.enum).map(Collection.from).getOrElseValue(Nil)
        );
    }
}


export class SchemaObject implements Schema {

    readonly schemaType = 'object';

    protected constructor(readonly name: string,
                          readonly title: string,
                          readonly type: string,
                          readonly properties: Collection<Property>,
                          readonly parents: HashMap<string, SchemaObject>,
                          readonly explicitlyRequiredProperties: HashSet<string>) {
    }

    get parentsString() {
        return this.parents.nonEmpty ? ' extends ' + this.parents.keySet.map(n => NameUtils.normaliseClassname(n)).mkString(', ') : '';
    }

    propsIncludingInherited(): Collection<Property> {
        const pendingParents = this.parents.values.toArray;
        const props = this.properties.toBuffer;
        const propNames = props.map(p => p.name).toSet.toMutable;
        while (pendingParents.length > 0) {
            const parent = pendingParents.shift();
            props.appendAll(parent.properties.filter(parentProp => !propNames.contains(parentProp.name)));
            parent.parents.values.foreach(pp => pendingParents.push(pp));
        }
        return props.toCollection;
    }

    static allSuperClassDefined(def: OpenApiSchema,
                                schemasTypes: HashMap<string, SchemaType>,
                                pool: HashSet<string>) {
        const parents = option(def.allOf)
            .map(x => Collection.from(x))
            .filter(x => x.nonEmpty)
            .getOrElseValue(Nil)
            .flatMapOption(x => option(x['$ref'] as string))
            .map(x => x.substring(SCHEMA_PREFIX.length))
            .filter(p => schemasTypes.get(p).contains('object'))
            .toSet;
        return parents.removedAll(pool).isEmpty
    }

    static fromDefinition(name: string,
                          def: OpenApiSchema,
                          schemasTypes: HashMap<string, SchemaType>,
                          options: GenerationOptions,
                          pool: HashMap<string, Schema>) {

        const allOff = option(def.allOf).map(x => Collection.from(x)).filter(x => x.nonEmpty);
        const parents = allOff.getOrElseValue(Nil)
            .flatMapOption(x => option(x['$ref'] as string))
            .map(x => x.substring(SCHEMA_PREFIX.length))
            .filter(p => schemasTypes.get(p).contains('object'));

        // explicitly required properties should also be collected from all parents
        const explicitlyRequired = option(def.required)
            .map(arr => typeof arr === 'boolean' ? Nil : Collection.from(arr))
            .getOrElseValue(Nil)
            .appendedAll(parents.flatMap(p =>
                pool.get(p)
                    .map(o => (o as SchemaObject).explicitlyRequiredProperties)
                    .getOrElseValue(HashSet.empty)
                    .toCollection
            ))
            .toSet;


        const properties = allOff.getOrElseValue(Collection.of(def))
            .flatMap(subSchema => {
                return option(subSchema['properties'])
                    .map(props => Collection.from(Object.keys(props)))
                    .getOrElseValue(Nil)
                    .map(propName => {
                            const property = Property.fromDefinition(propName, subSchema['properties'][propName], schemasTypes, options);
                            return property.copy({
                                required: explicitlyRequired.contains(propName) ? true : property.required
                            });
                        }
                    );
            })

        return new SchemaObject(name, def.title, def.type, properties,
            parents.toMap(p => [p, pool.get(p).get as SchemaObject]),
            explicitlyRequired);
    }

    get normalName() {
        return NameUtils.normaliseClassname(this.name);
    }
}
