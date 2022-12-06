import {OpenApiProperty} from './openapi.js';
import {HashMap, identity, Option, option} from 'scats';
import {Schema, SchemaType} from './schemas.js';

const SCHEMA_PREFIX = '#/components/schemas/';

export class Property implements Schema {

    readonly schemaType = "property";

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

    static fromDefinition(name: string,
                          definition: OpenApiProperty,
                          schemas: HashMap<string, SchemaType>) {

        const referencesObject = option(definition.$ref)
            .exists(ref => schemas.get(ref.substring(SCHEMA_PREFIX.length)).contains('object'));

        const itemReferencesObject = option(definition.items)
            .flatMap(i => option(i.$ref))
            .exists(ref => schemas.get(ref.substring(SCHEMA_PREFIX.length)).contains('object'));

        const type = option(definition.$ref)
            .map(ref => ref.substring(SCHEMA_PREFIX.length))
            .getOrElseValue(definition.type);
        const nullable = option(definition.nullable).exists(identity);
        const description = option(definition.description);
        const required = option(definition.required).exists(identity);
        const items = option(definition.items?.$ref)
            .map(ref => ref.substring(SCHEMA_PREFIX.length))
            .orElseValue(option(definition.items?.type))
            .getOrElseValue('any');

        return new Property(name, type, description, null, nullable, required, items, referencesObject, itemReferencesObject);
    }


    get jsType(): string {
        return Property.toJsType(this.type, this.items);
    }

    get scatsType(): string {
        switch (this.type) {
            case 'array': {
                if (this.itemReferencesObject) {
                    return `Collection<${this.items}Dto>`;
                } else {
                    return `Collection<${Property.toJsType(this.items)}>`;
                }
            }
            default: return this.jsType;
        }
    }
    get isArray(): boolean {
        return this.type === 'array';
    }

    static toJsType(tpe: string, itemTpe = 'any'): string {
        switch (tpe) {
            case 'integer': return 'number';
            case 'array': return `readonly ${Property.toJsType(itemTpe)}[]`;
            default: return tpe;
        }
    }


    get itemScatsWrapperType(): string {
        if (this.isArray) {
            return `${this.items}Dto`;
        } else {
            return this.scatsWrapperType;
        }
    }

    get scatsWrapperType(): string {
        if (this.referencesObject) {
            return `${this.type}Dto`;
        } else if (this.isArray && this.itemReferencesObject) {
            return `Collection<${this.items}Dto>`;
        } else {
            return this.scatsType;
        }
    }
}
