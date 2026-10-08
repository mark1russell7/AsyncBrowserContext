/**
 * The type of `virtual:transform-examples` (refer to
 * `build/transform-examples-plugin.ts`).
 */
declare module "virtual:transform-examples" {
    export type TransformExample = {
        id : string;
        title : string;
        note : string;
        input : string;
        output : string;
    };
    const examples : TransformExample[];
    export default examples;
}
