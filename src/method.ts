import {OpenApiMethod} from './openapi.js';
import {Collection, HashMap, identity, Option, option} from 'scats';
import {Property} from './property.js';
import {Parameter} from './parameter.js';
import {SchemaEnum, SchemaFactory, SchemaObject} from './schemas.js';


export interface ResponseDetails {
    responseType: string;
    description?: string;
}


const sortByIn = HashMap.of(
    ['path', 0],
    ['query', 1],
    ['header', 2],
    ['body', 3],
);

export class Method {

    readonly tags: string[];
    readonly summary?: string;
    readonly response: ResponseDetails;
    readonly parameters: Collection<Parameter>;
    private readonly body: Option<SchemaEnum | SchemaObject | Property>;


    constructor(readonly path: string, readonly method: string, def: OpenApiMethod) {
        this.tags = option(def.tags).getOrElseValue([]);
        this.summary = def.summary;


        const parameters = Collection.from(def.parameters)
            .map(p => Parameter.fromDefinition(p))
            .sort((a, b) => {
                const r1 = a.required ? 1 : 0;
                const r2 = b.required ? 1 : 0;
                const reqS = r2 - r1;
                if (reqS === 0) {
                    return sortByIn.get(a.in).getOrElseValue(10) - sortByIn.get(b.in).getOrElseValue(10);
                } else {
                    return reqS;
                }
            });
        const namesCount = parameters.groupBy(p => p.name);
        this.parameters = parameters.map(p => {
            if (namesCount.get(p.name).exists(c => c.size > 1)) {
                return p.copy({
                    uniqueName: `${p.in}${Method.capitalize(p.name)}`
                });
            } else {
                return p;
            }
        });

        this.body = option(def.requestBody).flatMap(body => option(body.content))
            .flatMap(body => {
                const mimeTypes = Collection.from(Object.keys(body));
                return mimeTypes
                    .find(_ => _ === 'application/json')
                    .orElseValue(mimeTypes.headOption)
                    .map(mt => SchemaFactory.build('body', body[mt].schema));
            });


        const statusCodes = Collection.from(Object.keys(def.responses))
            .map(x => parseInt(x));

        const successCode = statusCodes
            .filter(code => code / 100 === 2)
            .minByOption(identity);

        const respDef = successCode.map(_ => def.responses[_]).getOrElseValue(def.responses[statusCodes.head]);

        const mimeTypes = option(respDef.content)
            .map(content => Collection.from(Object.keys(content)).toMap(mimeType =>
                [mimeType, content[mimeType]]
            )).getOrElseValue(HashMap.empty);

        this.response = mimeTypes.get('application/json')
            .orElseValue(mimeTypes.values.headOption)
            .map(p => new Property('', p.schema))
            .map(r => ({
                responseType: r.jsType,
                description: respDef.description
            } as ResponseDetails))
            .getOrElseValue(({
                responseType: 'any'
            }));

    }

    get endpointName() {
        return `${this.method}${Method.pathToName(this.path)}`;
    }

    get pathWithSubstitutions(): string {
        const paramPrefix = `${this.parameters.size > 2 ? 'params.' : ''}`;
        return this.path.replace(/\{(\w+?)\}/g, (matched, group) => {
            const remappedName = this.parameters.find(p => p.name === group && p.in === 'path')
                .map(_ => _.uniqueName)
                .getOrElseValue(group);
            return `\${${paramPrefix}${remappedName}}`;
        });
    }

    static pathToName(path: string): string {
        const tokens = Collection.from(path.split('/'));
        return tokens.filter(t => t.length > 0).map(t => {
            let token = t;
            if (t[0] == '{') { // path param
                token = `By${this.capitalize(t.substring(1, t.length - 1))}`;
            }
            return Collection.from(token.split(/\W/)).map(_ => this.capitalize(_)).mkString();
        }).mkString();
    }

    static capitalize(s: string) {
        if (s.length <= 0) {
            return s;
        } else {
            return s[0].toUpperCase() + s.substring(1);
        }
    }
}

