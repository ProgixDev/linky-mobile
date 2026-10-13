// TypeScript 6 type-checks side-effect imports, so `import '../global.css'`
// in app/_layout.tsx needs a declaration. Metro + NativeWind handle the file.
declare module '*.css';
