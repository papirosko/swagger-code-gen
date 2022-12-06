import {OpenApiSchema} from './openapi.js';
import {Collection, HashMap, Nil, option} from 'scats';
import {Property} from './property.js';

export type SchemaType = 'object' | 'enum' | 'property';

export interface Schema {
    readonly schemaType: SchemaType;
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


    static build(name: string, def: OpenApiSchema, schemasTypes: HashMap<string, SchemaType>): Schema {
        if (def.type === 'object') {
            return SchemaObject.fromDefinition(name, def, schemasTypes);
        } else if (def.enum) {
            return SchemaEnum.fromDefinition(name, def);
        } else if (def.type === 'string') {
            return Property.fromDefinition(name, def, schemasTypes);
        } else if (def.type === 'boolean') {
            return Property.fromDefinition(name, def, schemasTypes);
        } else if (def.type === 'integer') {
            return Property.fromDefinition(name, def, schemasTypes);
        } else if (def.type === 'array') {
            return Property.fromDefinition(name, def, schemasTypes);
        } else {
            return Property.fromDefinition(name, def, schemasTypes);
            // throw new Error(`unsupported schema type: ${def.type}`);
        }

    }

}


export class SchemaEnum implements Schema {
    readonly schemaType = 'enum';

    protected constructor(readonly name: string,
                          readonly title: string,
                          readonly type: string,
                          readonly values: Collection<string>) {
    }

    static fromDefinition(name: string, def: OpenApiSchema) {
        return new SchemaEnum(name, def.title, def.type, option(def.enum).map(Collection.from).getOrElseValue(Nil));
    }
}


export class SchemaObject implements Schema {

    readonly schemaType = 'object';

    protected constructor(readonly name: string,
                          readonly title: string,
                          readonly type: string,
                          readonly properties: Collection<Property>) {
    }

    static fromDefinition(name: string, def: OpenApiSchema, schemasTypes: HashMap<string, SchemaType>) {
        const properties = Collection.from(Object.keys(def.properties)).map(p =>
            Property.fromDefinition(p, def.properties[p], schemasTypes)
        );
        return new SchemaObject(name, def.title, def.type, properties);
    }
}
