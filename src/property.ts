import {OpenApiProperty} from './openapi.js';
import {identity, Option, option} from 'scats';

const SCHEMA_PREFIX = '#/components/schemas/';

export class Property {

    name: string;
    type: string;
    description: Option<string>;
    default: any;
    // example: string;
    readonly nullable: boolean;
    readonly required: boolean;
    readonly items: string;


    constructor(name: string, definition: OpenApiProperty) {
        this.name = name;
        this.type = option(definition.$ref)
            .map(ref => ref.substring(SCHEMA_PREFIX.length))
            .getOrElseValue(definition.type);
        this.nullable = option(definition.nullable).exists(identity);
        this.description = option(definition.description);
        this.required = option(definition.required).exists(identity);
        this.items = option(definition.items?.$ref)
            .map(ref => ref.substring(SCHEMA_PREFIX.length))
            .orElseValue(option(definition.items?.type))
            .getOrElseValue('any');
    }


    get jsType(): string {
        return Property.toJsType(this.type, this.items);
    }

    static toJsType(tpe: string, itemTpe = 'any'): string {
        switch (tpe) {
            case 'integer': return 'number';
            case 'array': return `readonly ${Property.toJsType(itemTpe)}[]`;
            default: return tpe;
        }

    }
}
