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
    onlyUsedSchemas: boolean;
    includeSchemasByMask: HashSet<string>;
}

export class SchemaFactory {

    private static hasType(def: OpenApiSchema | OpenApiProperty, expectedType: string): boolean {
        const typeValue = def.type;
        if (Array.isArray(typeValue)) {
            return typeValue.includes(expectedType);
        }
        return typeValue === expectedType;
    }

    private static hasObjectProperties(def: OpenApiSchema | OpenApiProperty): boolean {
        return option(def.properties).map(p => Object.keys(p).length).getOrElseValue(0) > 0;
    }

    private static firstNonNullType(def: OpenApiSchema): string | undefined {
        const typeValue = def.type;
        if (Array.isArray(typeValue)) {
            return typeValue.find(token => token !== 'null');
        }
        return typeValue;
    }

    static isEmptyObjectOrArray(x: any) {
        if (Array.isArray(x) && x.length === 0) return true;
        if (typeof x === 'object' && Object.keys(x).length === 0) return true;
        return false;
    }

    static resolveSchemaType(def: OpenApiSchema): SchemaType {
        if (SchemaFactory.hasType(def, 'object') ||
            SchemaFactory.hasObjectProperties(def) ||
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
        const primaryType = SchemaFactory.firstNonNullType(def);
        if (SchemaFactory.hasType(def, 'object') ||
            SchemaFactory.hasObjectProperties(def) ||
            schemasTypes.get(name).contains('object')
        ) {
            return SchemaObject.fromDefinition(name, def, schemasTypes, options, HashMap.empty);
        } else if (def.enum) {
            return SchemaEnum.fromDefinition(name, def);
        } else if (primaryType === 'string') {
            return Property.fromDefinition('', name, {
                ...def as OpenApiProperty,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else if (primaryType === 'boolean') {
            return Property.fromDefinition('', name, {
                ...def as OpenApiProperty,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else if (primaryType === 'integer') {
            return Property.fromDefinition('', name, {
                ...def as OpenApiProperty,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else if (primaryType === 'array') {
            return Property.fromDefinition('', name, {
                ...def as OpenApiProperty,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else {
            return Property.fromDefinition('', name, {
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
                          readonly defaultValue: Option<string | number | boolean>,
                          readonly values: Collection<string>) {
    }

    static fromDefinition(name: string, def: OpenApiSchema) {
        const typeValue = Array.isArray(def.type) ? def.type.find(token => token !== 'null') : def.type;
        return new SchemaEnum(
            name,
            def.title ?? name,
            option(def.description),
            typeValue ?? 'string',
            option(def.default),
            option(def.enum).map(Collection.from).getOrElseValue(Nil)
        );
    }


    get normalName() {
        return NameUtils.normaliseClassname(this.name);
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

    /**
     * Generates the `extends` clause for the interface.
     * When a child schema (via allOf) re-declares a property from a parent with a
     * different (wider) type, TypeScript rejects plain `extends`. In that case we
     * emit `Omit<Parent, 'field1' | 'field2'>` so the child can safely override
     * those fields while still inheriting the rest.
     */
    get parentsString() {
        if (this.parents.isEmpty) return '';
        const ownPropNames = this.properties.map(p => p.name).toSet;
        const parts = this.parents.entries.map(([name, parent]) => {
            const conflicts = parent.properties
                .filter(pp => ownPropNames.contains(pp.name))
                .map(pp => pp.name);
            const normalName = NameUtils.normaliseClassname(name);
            if (conflicts.nonEmpty) {
                const omitKeys = conflicts.map(c => `'${c}'`).mkString(' | ');
                return `Omit<${normalName}, ${omitKeys}>`;
            }
            return normalName;
        });
        return ' extends ' + parts.mkString(', ');
    }

    propsIncludingInherited(): Collection<Property> {
        const pendingParents = this.parents.values.toArray;
        const props = this.properties.toBuffer;
        const propNames = props.map(p => p.name).toSet.toMutable;
        while (pendingParents.length > 0) {
            const parent = pendingParents.shift();
            if (parent) {
                props.appendAll(parent.properties.filter(parentProp => !propNames.contains(parentProp.name)));
                parent.parents.values.foreach(pp => pendingParents.push(pp));
            }
        }
        return props.toCollection;
    }

    static allSuperClassDefined(def: OpenApiSchema,
                                schemasTypes: HashMap<string, SchemaType>,
                                pool: HashSet<string>) {
        const parents = option(def.allOf)
            .orElse(() => option(def['$ref']).map(x => [{$ref: x} as OpenApiProperty]))
            .map(x => Collection.from(x))
            .filter(x => x.nonEmpty)
            .getOrElseValue(Nil)
            .flatMapOption(x => option(x['$ref'] as string))
            .map(x => x.substring(SCHEMA_PREFIX.length))
            .filter(p => schemasTypes.get(p).contains('object'))
            .toSet;
        return parents.removedAll(pool).isEmpty;
    }

    static fromDefinition(name: string,
                          def: OpenApiSchema,
                          schemasTypes: HashMap<string, SchemaType>,
                          options: GenerationOptions,
                          pool: HashMap<string, Schema>) {

        const allOff = option(def.allOf)
            .orElse(() => option(def['$ref']).map(x => [{$ref: x} as OpenApiProperty]))
            .map(x => Collection.from(x)).filter(x => x.nonEmpty);
        const parents = allOff.getOrElseValue(Nil)
            .flatMapOption(x => option(x['$ref'] as string))
            .map(x => x.substring(SCHEMA_PREFIX.length))
            .filter(p => schemasTypes.get(p).contains('object'));

        // explicitly required properties should also be collected from all parents
        const explicitlyRequired = allOff
            .getOrElseValue(Collection.of(def))
            .flatMap(subSchema => option(subSchema.required)
                .filter(arr => Array.isArray(arr))
                .map(arr => Collection.from(arr as string[]))
                .getOrElseValue(Nil)
            )
            .appendedAll(parents.flatMap(p =>
                pool.get(p)
                    .map(o => (o as SchemaObject).explicitlyRequiredProperties)
                    .getOrElseValue(HashSet.empty)
                    .toCollection
            ))
            .toSet;


        const collectedProperties = allOff.getOrElseValue(Collection.of(def))
            .flatMap(subSchema => {
                return option(subSchema['properties'])
                    .map(props => Collection.from(Object.keys(props)))
                    .getOrElseValue(Nil)
                    .map(propName => {
                            const propertyDefinition = subSchema.properties?.[propName];
                            if (!propertyDefinition) {
                                throw new Error(`No property definition for ${name}.${propName}`);
                            }
                            const property = Property.fromDefinition(name, propName, propertyDefinition, schemasTypes, options);
                            return property.copy({
                                required: explicitlyRequired.contains(propName) ? true : property.required
                            });
                        }
                    );
            });

        const takenNames = new Set<string>();
        const nextSuffixByName = new Map<string, number>();
        const properties = collectedProperties.map(property => {
            const baseName = property.normalisedName;
            if (!takenNames.has(baseName)) {
                takenNames.add(baseName);
                return property;
            }
            const start = nextSuffixByName.get(baseName) || 1;
            let suffix = start;
            let candidate = `${baseName}_${suffix}`;
            while (takenNames.has(candidate)) {
                suffix += 1;
                candidate = `${baseName}_${suffix}`;
            }
            nextSuffixByName.set(baseName, suffix + 1);
            takenNames.add(candidate);
            return property.copy({
                safeName: candidate
            });
        });

        const typeValue = Array.isArray(def.type) ? def.type.find(token => token !== 'null') : def.type;
        return new SchemaObject(name, def.title ?? name, typeValue ?? 'object', properties,
            parents.toMap(p => [p, pool.get(p).getOrElseThrow(() => new Error(`No parent schema for ${p}`)) as SchemaObject]),
            explicitlyRequired);
    }

    get normalName() {
        return NameUtils.normaliseClassname(this.name);
    }
}
