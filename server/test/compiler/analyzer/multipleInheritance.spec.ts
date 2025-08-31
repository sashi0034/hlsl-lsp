import {expectSuccess} from "./utils";

describe('analyzer/multipleInheritance', () => {
    expectSuccess([{
        uri: 'file:///path/to/file_a.hlsl',
        content: `
            class A {}
            `
    }, {
        uri: 'file:///path/to/file_b.hlsl',
        content: `
            #include "file_a.hlsl"
            class B : A { 
                int b;
                int get_b() { return b; }
                int get_b(int b2) { return b; }
            }
            `
    }, {
        uri: 'file:///path/to/file_c.hlsl',
        content: `
            #include "file_b.hlsl"
            class C : B { }
            `
    }, {
        uri: 'file:///path/to/file_d.hlsl',
        content: `
            #include "file_c.hlsl"
            class D : C { 
                int d;
            }
            `
    }, {
        uri: 'file:///path/to/file_e.hlsl',
        content: `// Inherited class members with multiple files. (#205)
            #include "file_d.hlsl"
            class E : D {
                int test(E other) {
                    return b + get_b() + d + 
                        other.b + other.get_b() + other.d;
                }
            }
            `
    }]);
});