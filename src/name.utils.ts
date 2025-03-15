export class NameUtils {

    static normaliseClassname(n: string): string {
        if (!n) return '';
        let res = '';
        let needUpperCase = true; // first letter always uppercased
        for (let i = 0; i < n.length; i++) {
            const c = n[i];
            if (c === '.' || c === '-') {
                needUpperCase = true;
            } else if (needUpperCase) {
                    res += c.toUpperCase();
                    needUpperCase = false;
                } else {
                    res += c;
                }
        }
        return res;
    }


    static normaliseMethodName(n: string): string {
        if (n === 'delete') {
            return `$${n}`;
        } else {
            return n.replace(/\./g, '_');
        }
    }
}
