export class NameUtils {

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
        if (n === 'delete') {
            return `$${n}`;
        } else {
            return n.replace(/[./]/g, '_');
        }
    }



    static normalisePropertyName(n: string): string {
        return n.replace(/[.-]/g, '_');
    }
}
