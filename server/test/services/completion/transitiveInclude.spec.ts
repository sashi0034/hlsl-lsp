import {testCompletion} from "./utils";

describe('completion/transitiveInclude', () => {
    testCompletion([{
            uri: 'file:///path/to/file_1.hlsl',
            content: `
            int ThisYear = 2025:
            int GetNextYear() { return ThisYear + 1; }
            `
        }, {
            uri: 'file:///path/to/file_2.hlsl',
            content: `
            #include "file_1.hlsl"
        `
        }, {
            uri: 'file:///path/to/file_3.hlsl',
            content: `// Transitive includes are available.
            #include "file_2.hlsl"
            void main() {
                $C0$
            }
        `
        }], /* $C0$ */ ["ThisYear", "GetNextYear", "main"]
    );

    testCompletion([{
            uri: 'file:///path/to/file_1.hlsl',
            content: `
            #include "file_1.hlsl"
            #include "file_2.hlsl"
            int Alpha = 1;
            `
        }, {
            uri: 'file:///path/to/file_2.hlsl',
            content: `
            #include "file_1.hlsl"
            #include "file_2.hlsl"
            int Beta = 2;
        `
        }, {
            uri: 'file:///path/to/file_3.hlsl',
            content: `// Transitive includes can be cyclic.
            #include "file_1.hlsl"
            void main() {
                $C0$
            }
        `
        }], /* $C0$ */ ["Alpha", "Beta", "main"]
    );
});
