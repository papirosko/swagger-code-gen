import {OpenApiSchema} from './openapi.js';
import {Collection, Nil, option} from 'scats';
import {Property} from './property.js';

export interface Schema {
    readonly schemaType: 'object' | 'enum';
}

export class SchemaFactory {

    static build(name: string, def: OpenApiSchema): SchemaEnum | SchemaObject | Property {
        if (def.type === 'object') {
            return new SchemaObject(name, def);
        } else if (def.enum){
            return new SchemaEnum(name, def);
        } else if (def.type === 'string'){
            return new Property(name, def);
        } else if (def.type === 'boolean'){
            return new Property(name, def);
        } else if (def.type === 'integer'){
            return new Property(name, def);
        } else if (def.type === 'array'){
            return new Property(name, def);
        } else {
            return new Property(name, def);
            // throw new Error(`unsupported schema type: ${def.type}`);
        }

    }

}


export class SchemaEnum implements Schema {
    readonly name: string;
    readonly title: string;
    readonly type: string;
    readonly values: Collection<string>;
    readonly schemaType = 'enum';



    constructor(name: string, def: OpenApiSchema) {
        this.name = name;
        this.title = def.title;
        this.type = def.type;
        this.values = option(def.enum).map(Collection.from).getOrElseValue(Nil);
    }
}


export class SchemaObject implements Schema {
    readonly name: string;
    readonly title: string;
    readonly type: string;
    readonly properties: Collection<Property>;
    readonly schemaType = 'object';


    constructor(name: string, def: OpenApiSchema) {
        this.name = name;
        this.title = def.title;
        this.type = def.type;
        this.properties = Collection.from(Object.keys(def.properties)).map(p => new Property(p, def.properties[p]));
    }
}
