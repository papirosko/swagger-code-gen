import {OpenApiParam} from './openapi.js';
import {GenerationOptions, SchemaEnum, SchemaFactory, SchemaObject, SchemaType} from './schemas.js';
import {Collection, HashMap, identity, none, Option, option} from 'scats';
import {Method} from './method.js';
import {Property} from './property.js';

export class Parameter {

    readonly in: string;

    constructor(readonly name: string,
                readonly uniqueName: string,
                inValue: string,
                readonly jsType: string,
                readonly required: boolean,
                readonly defaultValue: Option<string | number>,
                readonly description: Option<string>) {
        this.in = inValue;
    }

    static fromDefinition(def: OpenApiParam, schemas: HashMap<string, SchemaType>, options: GenerationOptions): Parameter {
        const name = Parameter.toJSName(def.name);
        const inValue = def.in;
        const desc = option(def.description);
        let defaultValue: Option<string | number> = none;
        const schema = SchemaFactory.build(def.name, def.schema, schemas, options);
        let jsType: string;
        if (schema instanceof SchemaObject) {
            jsType = schema.type;
        } else if (schema instanceof SchemaEnum) {
            if (schemas.containsKey(schema.name)) {
                jsType = schema.name;
            } else if (schema.type === 'string') {
                jsType = `${schema.values.map(x => `'${x}'`).mkString(' | ')}`;
            } else if (schema.type === 'integer') {
                jsType = `${schema.values.map(x => `${x}`).mkString(' | ')}`;
            } else {
                jsType = schema.type;
            }
            defaultValue = schema.defaultValue.map(x => {
                if (schema.type === 'string') {
                    return `'${x}'`
                } else {
                    return x;
                }

            });
        } else if (schema instanceof Property) {
            jsType = schema.jsType;
        } else {
            throw new Error('Unknown schema type');
        }
        const required = option(def.required).exists(identity) || defaultValue.nonEmpty;
        return new Parameter(name, name, inValue, jsType, required, defaultValue, desc);
    }

    static toJSName(path: string): string {
        const tokens = Collection.from(path.split(/\W/)).filter(t => t.length > 0);
        return tokens.headOption.getOrElseValue('') + tokens.drop(1).map(t => {
            return Method.capitalize(t);
        }).mkString();
    }

    copy(p: Partial<Parameter>): Parameter {
        return new Parameter(
            option(p.name).getOrElseValue(this.name),
            option(p.uniqueName).getOrElseValue(this.uniqueName),
            option(p.in).getOrElseValue(this.in),
            option(p.jsType).getOrElseValue(this.jsType),
            option(p.required).getOrElseValue(this.required),
            option(p.defaultValue).getOrElseValue(this.defaultValue),
            option(p.description).getOrElseValue(this.description),
        );
    }

}
