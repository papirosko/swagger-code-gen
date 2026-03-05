export class NameUtils {
    private static readonly RESERVED_IDENTIFIERS = new Set([
        'abstract',
        'any',
        'as',
        'asserts',
        'async',
        'await',
        'bigint',
        'boolean',
        'break',
        'case',
        'catch',
        'class',
        'const',
        'constructor',
        'continue',
        'debugger',
        'declare',
        'default',
        'delete',
        'do',
        'else',
        'enum',
        'export',
        'extends',
        'false',
        'finally',
        'for',
        'function',
        'get',
        'if',
        'implements',
        'import',
        'in',
        'infer',
        'instanceof',
        'interface',
        'is',
        'keyof',
        'let',
        'module',
        'namespace',
        'never',
        'new',
        'null',
        'number',
        'object',
        'of',
        'package',
        'private',
        'protected',
        'public',
        'readonly',
        'require',
        'return',
        'set',
        'static',
        'string',
        'super',
        'switch',
        'symbol',
        'this',
        'throw',
        'true',
        'try',
        'typeof',
        'undefined',
        'unique',
        'unknown',
        'var',
        'void',
        'while',
        'with',
        'yield',
    ]);

    static normaliseClassname(n: string): string {
        if (!n) return '';
        let res = '';
        let needUpperCase = true; // first letter always uppercased
        for (let i = 0; i < n.length; i++) {
            const c = n[i];
            let toAppend = c;
            if (c === '.' || c === '-' || c === '/') {
                needUpperCase = true;
                toAppend = '';
            } else if (needUpperCase) {
                toAppend = c.toUpperCase();
                needUpperCase = false;
            }

            res += toAppend;


        }
        return res;
    }


    static normaliseMethodName(n: string): string {
        return NameUtils.escapeIdentifier(n.replace(/[./]/g, '_'));
    }



    static normalisePropertyName(n: string): string {
        return NameUtils.escapeIdentifier(n.replace(/[.-]/g, '_'));
    }

    static escapeIdentifier(n: string): string {
        if (!n) {
            return '_';
        }
        const startsWithInvalid = /^[^A-Za-z_$]/.test(n);
        if (startsWithInvalid || NameUtils.RESERVED_IDENTIFIERS.has(n)) {
            return `$${n}`;
        }
        return n;
    }
}
