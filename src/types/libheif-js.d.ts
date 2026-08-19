// libheif-js ships no types. Declared narrowly: only the two calls the ingest
// path uses, so a wrong assumption about the rest of the surface cannot compile.
declare module 'libheif-js' {
  interface HeifImage {
    get_width(): number
    get_height(): number
    display(
      target: { data: Uint8ClampedArray; width: number; height: number },
      done: (result: unknown) => void,
    ): void
  }

  export class HeifDecoder {
    decode(bytes: Uint8Array): HeifImage[]
  }

  const _default: { HeifDecoder: typeof HeifDecoder }
  export default _default
}
