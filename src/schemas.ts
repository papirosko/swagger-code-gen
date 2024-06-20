import {OpenApiSchema} from './openapi.js';
import {Collection, HashMap, HashSet, Nil, Option, option} from 'scats';
import {Property} from './property.js';

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

    static resolveSchemaType(def: OpenApiSchema): SchemaType {
        if (def.type === 'object') {
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
        if (def.type === 'object') {
            return SchemaObject.fromDefinition(name, def, schemasTypes, options);
        } else if (def.enum) {
            return SchemaEnum.fromDefinition(name, def);
        } else if (def.type === 'string') {
            return Property.fromDefinition(name, {
                ...def,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else if (def.type === 'boolean') {
            return Property.fromDefinition(name, {
                ...def,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else if (def.type === 'integer') {
            return Property.fromDefinition(name, {
                ...def,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else if (def.type === 'array') {
            return Property.fromDefinition(name, {
                ...def,
                required: option(def.required).filter(x => typeof x === 'boolean')
                    .map(x => x as boolean).orUndefined
            }, schemasTypes, options);
        } else {
            return Property.fromDefinition(name, {
                ...def,
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
                          readonly type: string,
                          readonly defaultValue: Option<string | number>,
                          readonly values: Collection<string>) {
    }

    static fromDefinition(name: string, def: OpenApiSchema) {
        return new SchemaEnum(
            name,
            def.title,
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
                          readonly properties: Collection<Property>) {
    }

    static fromDefinition(name: string,
                          def: OpenApiSchema,
                          schemasTypes: HashMap<string, SchemaType>,
                          options: GenerationOptions) {
        const explicitlyRequired = option(def.required)
            .map(arr => typeof arr === 'boolean' ? Nil : Collection.from(arr));
        const properties = Collection.from(Object.keys(def.properties)).map(propName => {
                const property = Property.fromDefinition(propName, def.properties[propName], schemasTypes, options);
                return property.copy({
                    required: explicitlyRequired.exists(c => c.contains(propName)) ? true : property.required
                });
            }
        );
        return new SchemaObject(name, def.title, def.type, properties);
    }
}
